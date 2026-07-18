# MCP authorization with Better Auth 1.6.23

Date: 2026-07-18

## Conclusion

Sleevy's intended architecture is sound: Better Auth is the authorization server, `/mcp` is a resource server, public MCP clients register through DCR with PKCE, and `/mcp` locally verifies resource-bound JWT access tokens through Better Auth's resource client.

The idiomatic fix is **not** to query `oauthAccessToken` from `McpApp`. Make Better Auth's effective auth path explicit, then use `oauthProviderResourceClient(auth).verifyAccessToken` with explicit MCP issuer and audience checks. In particular:

```ts
const authBasePath = "/api/auth"
const authIssuer = `${config.auth.baseUrl}${authBasePath}`

betterAuth({
  baseURL: config.auth.baseUrl,
  basePath: authBasePath,
  plugins: [
    jwt(),
    oauthProvider({
      validAudiences: [`${config.auth.baseUrl}/mcp`],
      // existing DCR, scope, login, and consent settings
    }),
  ],
})
```

The MCP handler should then verify with the Better Auth resource client and the single required audience, without an opaque-token database fallback:

```ts
await oauthClient.verifyAccessToken(token, {
  verifyOptions: {
    issuer: authIssuer,
    audience: `${config.auth.baseUrl}/mcp`,
  },
})
```

Making `basePath` explicit matters in 1.6.23. The resource client builds the JWKS URL from the *raw* `auth.options.baseURL` and `auth.options.basePath`; it does not apply Better Auth's implicit `/api/auth` default there. Sleevy currently leaves `basePath` unset, so the helper derives `/jwks` instead of the actual `/api/auth/jwks`. It also derives a default verification issuer from the JWT plugin's configured issuer or raw base URL, so continuing to pass the authorization-server issuer explicitly is correct. [Better Auth 1.6.23 resource-client source](https://github.com/better-auth/better-auth/blob/v1.6.23/packages/oauth-provider/src/client-resource.ts#L55-L134)

Configuring `jwt({ jwt: { issuer: authIssuer } })` is a valid optional centralization, but it is not required for this fix and is broader than necessary: it changes the default issuer for every token produced through the JWT plugin, not only OAuth access tokens. Better Auth's OAuth Provider already issues its access-token `iss` from the effective authorization-server base URL. The smaller idiomatic change is explicit `basePath` plus the documented explicit `issuer`/`audience` checks at the resource server.

## What the protocols require

For HTTP MCP, the MCP client must include the RFC 8707 `resource` parameter in both the authorization request and token request, using the canonical MCP server URI. The MCP server must accept only tokens issued specifically for itself. [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization#resource-parameter-implementation)

RFC 8707 defines `resource` as the target protected resource and recommends audience-restricting the issued token. In an authorization-code flow the authorization request's resource applies to the grant; a token request may choose a resource from the originally granted set. [RFC 8707 §2](https://www.rfc-editor.org/rfc/rfc8707.html#section-2)

The resource server should publish RFC 9728 protected-resource metadata whose `resource` exactly identifies the MCP endpoint and whose `authorization_servers` contains the authorization server's issuer. A 401 may point to that document through `WWW-Authenticate: Bearer resource_metadata="..."`. [RFC 9728 §§2–5](https://www.rfc-editor.org/rfc/rfc9728.html#section-2)

Sleevy's current `/.well-known/oauth-protected-resource/mcp` shape and 401 challenge follow this model: the resource is `${baseUrl}/mcp`, and the authorization server is `${baseUrl}/api/auth`.

## What Better Auth 1.6.23 actually does

### Token issuance

Better Auth 1.6.23 decides JWT versus opaque access token solely from `resource` on the **token request body**:

- `checkResource` reads `ctx.body.resource` and validates it against `validAudiences`.
- When an audience exists and the JWT plugin is enabled, it signs a JWT with `aud`, `iss`, `sub`, `azp`, and `scope`.
- Otherwise it generates a 32-character opaque token and stores its hash plus client, user, session, scopes, and expiry in `oauthAccessToken`.

[Better Auth 1.6.23 token source: resource validation and token selection](https://github.com/better-auth/better-auth/blob/v1.6.23/packages/oauth-provider/src/token.ts#L417-L583)

This matches Better Auth's recommendation to accept JWT access tokens at an API and verify them locally by JWKS. Its documentation says opaque access tokens require introspection and calls JWT-only acceptance the simplest approach for external APIs/MCP agents. [Better Auth OAuth Provider: API verification](https://better-auth.com/docs/plugins/oauth-provider#verification)

### A 1.6.23 resource-parameter asymmetry

The `/oauth2/token` schema accepts `resource`, but the `/oauth2/authorize` schema does not declare it. [Better Auth 1.6.23 OAuth endpoint schemas](https://github.com/better-auth/better-auth/blob/v1.6.23/packages/oauth-provider/src/oauth.ts#L268-L293) [token schema](https://github.com/better-auth/better-auth/blob/v1.6.23/packages/oauth-provider/src/oauth.ts#L737-L755)

Consequences:

1. A consent URL that lacks `resource` is not evidence that the MCP client's token request also omitted it; the decisive evidence is the form body sent to `/oauth2/token` and the returned token shape.
2. Better Auth 1.6.23 does not retain an authorization-request resource as part of the grant and restore it during token exchange. The client must send `resource` at the token endpoint to receive a resource-bound JWT.
3. This is narrower than Sleevy's current 401: a compliant current client can still receive the correct JWT because MCP requires it to repeat `resource` in the token request.

### Verification and opaque tokens

`oauthProviderResourceClient(auth)` verifies JWTs locally through JWKS. It only tries opaque-token introspection when `remoteVerify` is explicitly configured with a confidential resource-server client ID and secret. [Better Auth 1.6.23 resource-client source](https://github.com/better-auth/better-auth/blob/v1.6.23/packages/oauth-provider/src/client-resource.ts#L70-L140)

Better Auth's introspection endpoint can validate both JWT and opaque access tokens, but it requires `client_id` and `client_secret`; a public DCR client has no secret. Its opaque-token validation also checks expiry, client existence/disabled state, session, user, and scopes. [Better Auth 1.6.23 introspection source](https://github.com/better-auth/better-auth/blob/v1.6.23/packages/oauth-provider/src/introspect.ts#L142-L225) [introspection authentication](https://github.com/better-auth/better-auth/blob/v1.6.23/packages/oauth-provider/src/introspect.ts#L407-L455)

A dedicated confidential resource-server client plus `remoteVerify` is Better Auth's supported opaque-token pattern. It is not the right primary MCP design here: opaque tokens issued without `resource` have no audience, while MCP requires the resource server to establish that the token was issued specifically for `/mcp`. Enabling `allowMissingAudience` would deliberately skip that proof. Better Auth itself recommends JWT-only verification for this external-agent case. [Better Auth opaque-token guidance](https://better-auth.com/docs/plugins/oauth-provider#opaque-access-tokens)

## Comparison with Sleevy

### `apps/api/src/modules/auth/BetterAuth.ts`

Already correct:

- JWT plugin enabled.
- MCP URI included in `validAudiences`.
- DCR enabled, with unauthenticated registrations forced by Better Auth to public clients.
- PKCE-compatible authorization-code flow and narrowly declared scopes.

Needs correction:

- Set `basePath: "/api/auth"` explicitly on `betterAuth`.
- Keep the authorization-server issuer explicit in MCP verification. Configuring it globally on `jwt()` is optional, not necessary.
- Prefer only real resource-server identifiers in `validAudiences`; keep bare `baseUrl` only if the root API is intentionally a separately protected OAuth resource.

### `apps/api/src/runtime/McpApp.ts`

The JWT path is the right abstraction: extract Bearer, call Better Auth's resource client, require the `/mcp` audience, and map the resulting `sub` and `scope` to Sleevy's user/tools.

The working-tree opaque-token fallback is not idiomatic and should not ship:

- It duplicates Better Auth's private hashing/storage behavior.
- It bypasses Better Auth's full opaque-token validation, including disabled-client and session checks.
- It couples the resource server to OAuth Provider database schema details.
- Most importantly, an opaque token minted because `resource` was absent does not establish the MCP audience required by the MCP specification.

The earlier explicit issuer correction was right but incomplete: it fixed `iss` comparison while leaving the resource client's auto-derived JWKS URL dependent on an unset raw `basePath`.

### Confirmed local failure and fix

Local instrumentation established the exact failure sequence:

1. OAuth completed and the MCP request carried a JWT bearer token whose payload had `iss=http://localhost:4001/api/auth`, `aud=http://localhost:4001/mcp`, a user `sub`, and all seven granted Sleevy scopes. Because Better Auth 1.6.23 selects JWT issuance only when `ctx.body.resource` is present, this also establishes by inference that the token exchange supplied the MCP resource even though the POST body itself was not captured.
2. `oauthProviderResourceClient` fetched `http://localhost:4001/jwks`, which returned 404.
3. The actual key set at `http://localhost:4001/api/auth/jwks` returned 200.
4. Adding `basePath: "/api/auth"` made the resource client use the correct JWKS endpoint.
5. The same direct authenticated MCP flow then completed `tools/list` with HTTP 200 and returned all eight Sleevy tools; Codex retried MCP initialization with the bearer token successfully.

This confirms that the remaining direct failure was JWKS discovery, not a need for opaque-token persistence wiring.

## Public MCP clients: Codex and Executor

The client requirement is unambiguous: both authorization and token requests must carry `${baseUrl}/mcp` as `resource`. RMCP 1.7.0, used by Codex 0.141, adds its base URL to both authorization and code-exchange requests; Codex also exposes an `oauth_resource` override for the authorization URL. [Codex 0.141 dependency and OAuth login source](https://github.com/openai/codex/blob/rust-v0.141.0/codex-rs/rmcp-client/src/perform_oauth_login.rs#L497-L510) [RMCP 1.7.0 published source](https://docs.rs/crate/rmcp/1.7.0/source/src/transport/auth.rs)

There have nevertheless been concrete Codex regressions where login succeeded but token exchange omitted `resource`, producing exactly the “login succeeds, initialize returns auth required” symptom. [OpenAI Codex issue #20729](https://github.com/openai/codex/issues/20729)

Therefore the local end-to-end test should capture the `/oauth2/token` form body and assert:

```text
resource=http://localhost:4001/mcp
```

Then assert the returned access token has three JWT segments and decodes to:

```json
{
  "iss": "http://localhost:4001/api/auth",
  "aud": "http://localhost:4001/mcp"
}
```

Finally, initialize `/mcp` with that bearer token and list tools. Repeat the same capture for Executor. If Executor omits token-request `resource`, that is an Executor OAuth-client defect; accepting an audience-less token in Sleevy would conceal rather than fix it.

## Recommended implementation order

1. Make Better Auth `basePath` explicit; retain explicit issuer and audience checks in the MCP verifier.
2. Remove the `oauthAccessToken` database fallback and `PostgresClient` dependency from `McpApp`.
3. Keep explicit MCP `issuer` and `audience` verification; allow the resource client to derive the JWKS URL from the now-complete auth configuration.
4. Generate protected-resource metadata with `getProtectedResourceMetadata` or keep the equivalent manual response, ensuring exact resource/issuer equality.
5. Add a true local OAuth integration test that inspects the token request, JWT claims, MCP initialization, and `tools/list`.
6. Reauthenticate direct Codex and Executor after deployment so the production test starts with fresh credentials.
