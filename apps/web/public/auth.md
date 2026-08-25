# Sleevy agent authentication

Sleevy is a personal read-later service. Every Saved Item belongs to one person,
so there is no anonymous data to read and no useful call an agent can make
without a credential that a person granted it. This document is the prose
walkthrough of how an agent gets that credential, uses it, and gives it back.

Machine-readable equivalents of everything below:

- Protected-resource metadata (RFC 9728): <https://api.sleevy.app/.well-known/oauth-protected-resource>
- Protected-resource metadata for the MCP endpoint: <https://api.sleevy.app/.well-known/oauth-protected-resource/mcp>
- Authorization-server metadata (RFC 8414), including the `agent_auth` block: <https://api.sleevy.app/.well-known/oauth-authorization-server/api/auth>
- OpenAPI 3.1 description of the REST API: <https://sleevy.app/openapi.json>

## Discover

Start from the resource you want to call and let it tell you who guards it.

Calling either surface without a credential returns `401` with a
`WWW-Authenticate` header naming the protected-resource metadata document:

```
WWW-Authenticate: Bearer resource_metadata="https://api.sleevy.app/.well-known/oauth-protected-resource/mcp"
```

Fetch that document. It gives you `resource`, the `authorization_servers` list,
and `scopes_supported`. Then fetch the authorization server's own metadata from
the origin it names:

```
GET https://api.sleevy.app/.well-known/oauth-authorization-server/api/auth
```

That document carries the standard RFC 8414 fields — `issuer`,
`authorization_endpoint`, `token_endpoint`, `registration_endpoint`,
`revocation_endpoint`, `jwks_uri`, `code_challenge_methods_supported` — plus an
`agent_auth` block that points back at this page and names the URIs described in
the sections below.

## Pick a method

Sleevy offers two credentials. Pick by whether a person is present.

**OAuth 2.1 authorization code with PKCE — for interactive agents.** Use this
whenever the agent can open a browser for its user. The person signs in to
Sleevy and approves the exact scopes you asked for. This is the method the MCP
endpoint at `https://api.sleevy.app/mcp` expects, and it is what
`agent_auth.identity_types_supported` advertises as `anonymous`: the client
registers itself without asserting an identity of its own, and the human
authorizing the request supplies the identity.

**Personal API Key — for scripts and unattended clients.** A person creates a
scoped key at <https://sleevy.app/settings> and pastes it into your
configuration. There is no sales contact and no approval queue. Use this when no
browser is available.

Sleevy does not currently accept an `identity_assertion` — an agent presenting a
signed token from its own platform, such as an `id-jag`
(`urn:ietf:params:oauth:token-type:id-jag`) cross-domain identity assertion — in
place of a human authorization. `identity_types_supported` therefore lists only
`anonymous`. If Sleevy adds assertion-based registration, it will appear in the
`agent_auth` block as `identity_assertion` with an
`identity_assertion.assertion_types_supported` list, and this page will describe
it. Do not build against it before it is advertised.

## Register

Sleevy supports Dynamic Client Registration (RFC 7591), unauthenticated, so an
agent can enroll itself the first time it runs. This is the `register_uri` in the
`agent_auth` block:

```
POST https://api.sleevy.app/api/auth/oauth2/register
Content-Type: application/json

{
  "client_name": "Your agent's name",
  "redirect_uris": ["https://your-agent.example/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "saved-items:capture saved-items:read saved-items:write offline_access"
}
```

Registered clients are public clients: no client secret is issued, and PKCE with
`S256` is required on every authorization request. Store the returned
`client_id` and reuse it; do not register again on each run.

Most MCP clients do all of this for you. If you are connecting through an MCP
host, point it at `https://api.sleevy.app/mcp` and let it discover, register,
and authorize on its own.

## Claim

Claim a credential at the `claim_uri`, which is the OAuth token endpoint.

First send the person to the authorization endpoint with a PKCE challenge:

```
GET https://api.sleevy.app/api/auth/oauth2/authorize
  ?response_type=code
  &client_id=<client_id>
  &redirect_uri=<redirect_uri>
  &scope=saved-items:capture+saved-items:read+offline_access
  &code_challenge=<S256 challenge>
  &code_challenge_method=S256
  &state=<opaque state>
```

They sign in and see a consent screen listing exactly the scopes you asked for.
Ask for the narrowest set that does the job; a request for delete scopes you do
not need is a request a person may reasonably refuse.

Then exchange the code:

```
POST https://api.sleevy.app/api/auth/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<code>
&redirect_uri=<redirect_uri>
&client_id=<client_id>
&code_verifier=<PKCE verifier>
```

The response carries an `access_token`, an `expires_in`, and — when you asked
for `offline_access` — a `refresh_token`. Refresh with
`grant_type=refresh_token` against the same endpoint rather than sending the
person through the browser again.

The scopes are:

| Scope | Grants |
| --- | --- |
| `saved-items:capture` | Save a URL to the queue |
| `saved-items:read` | List and read Saved Items |
| `saved-items:write` | Update read state, Source, and Folder assignment |
| `saved-items:delete` | Delete Saved Items |
| `folders:read` | List Folders |
| `folders:write` | Create and update Folders |
| `folders:delete` | Delete Folders, keeping their Saved Items |
| `account:read` | Read the identity of the authenticated account |
| `offline_access` | Receive a refresh token |

## Use the credential

Both credentials are bearer tokens on the same header:

```
Authorization: Bearer <access token or API key>
```

Send it on every request to `https://api.sleevy.app`. For example:

```
POST https://api.sleevy.app/v1/captures
Authorization: Bearer <credential>
Content-Type: application/json
Idempotency-Key: 8f14e45f-ea4e-4a1f-9c2b-6f0a1d3c5e77

{ "url": "https://example.com/an-article" }
```

Send an `Idempotency-Key` on every write. Sleevy replays the first response for
a repeated key, so a retry after a timeout cannot create a second Saved Item.

Read `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` on every
response and slow down before you are refused rather than after.

## Errors

Every failure is JSON with a `code`, a `message`, and a `resolution` telling you
what to do next.

| Status | What it means | What to do |
| --- | --- | --- |
| `400` | The request is malformed, or the URL is not an HTTP(S) URL | Fix the request; do not retry unchanged |
| `401` | Missing, expired, or revoked credential | Read `WWW-Authenticate`, refresh the token, or re-run the authorization flow |
| `403` | The credential is valid but lacks the scope | Re-authorize with the scope the operation needs; retrying will not help |
| `404` | No such Saved Item, Folder, or route | Re-list to get current IDs |
| `409` | A conflicting resource exists, such as a duplicate Folder name | Read the existing resource instead of retrying |
| `429` | Rate limit exceeded | Wait for `Retry-After` seconds, then retry |
| `5xx` | Sleevy failed | Retry with backoff, reusing the same `Idempotency-Key` |

A `401` always carries `WWW-Authenticate` with the `resource_metadata` pointer,
so a client that lost its credential can rediscover the authorization server
without hard-coding anything.

## Revocation

A credential belongs to the person, and they can take it back at any time.

Revoke a token yourself when you are done with it, at the `revocation_uri`:

```
POST https://api.sleevy.app/api/auth/oauth2/revoke
Content-Type: application/x-www-form-urlencoded

token=<access or refresh token>
&client_id=<client_id>
```

A person revokes an API Key under **API Keys** at
<https://sleevy.app/settings>, and revokes a connected agent's OAuth grant from
the same screen. Revocation is immediate.

After a revocation, the next call returns `401` with the `WWW-Authenticate`
header described above. Treat that as the signal to start again at **Discover**,
not as a transient error to retry. Do not attempt to re-register and
re-authorize without the person asking for it; a revoked grant is a decision,
not a fault.
