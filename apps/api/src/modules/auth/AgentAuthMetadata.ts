import { AUTH_BASE_PATH } from "./BetterAuth.js"

// The two RFC 8414 paths Better Auth answers on. Both carry the same document,
// so both get the `agent_auth` block added to it.
export const authServerMetadataPaths = (basePath: string = AUTH_BASE_PATH) =>
  new Set([
    `/.well-known/oauth-authorization-server${basePath}`,
    `${basePath}/.well-known/oauth-authorization-server`,
  ])

/**
 * The auth.md `agent_auth` block, describing how an agent enrols itself.
 *
 * auth.md names these endpoints `identity_endpoint` and `claim_endpoint`, while
 * the discovery scanners built against the earlier draft probe `register_uri`,
 * `claim_uri`, and `revocation_uri`. Both spellings are emitted, pointing at the
 * same real endpoints, so neither reader has to guess.
 *
 * Only `anonymous` is advertised, and that is the whole truth: an agent
 * registers itself through unauthenticated Dynamic Client Registration and a
 * person then authorizes it. Sleevy accepts no `identity_assertion` — no
 * `id-jag`, no verified email — so listing one would advertise an endpoint that
 * refuses every assertion sent to it.
 */
export const agentAuthBlock = (input: {
  readonly apiBaseUrl: string
  readonly webUrl: string
}) => {
  const authServer = `${input.apiBaseUrl}${AUTH_BASE_PATH}`

  return {
    skill: `${input.webUrl}/auth.md`,
    documentation_uri: `${input.webUrl}/auth.md`,

    identity_endpoint: `${authServer}/oauth2/register`,
    claim_endpoint: `${authServer}/oauth2/token`,
    register_uri: `${authServer}/oauth2/register`,
    claim_uri: `${authServer}/oauth2/token`,
    revocation_uri: `${authServer}/oauth2/revoke`,

    identity_types_supported: ["anonymous"],
    anonymous: {
      credential_types_supported: ["access_token", "api_key"],
      register_uri: `${authServer}/oauth2/register`,
      claim_uri: `${authServer}/oauth2/token`,
      revocation_uri: `${authServer}/oauth2/revoke`,
      // Registration takes no credential; the person supplies the identity at
      // the consent screen.
      registration_authentication: "none",
      code_challenge_methods_supported: ["S256"],
    },
  } as const
}

/**
 * Merges the `agent_auth` block into an authorization-server metadata response.
 *
 * The document is Better Auth's, so it is parsed and re-serialised rather than
 * replaced: a field the plugin adds later still reaches the client. A body that
 * is not a JSON object is passed through untouched, so an error response from
 * the auth handler stays the error it was.
 */
export const withAgentAuthMetadata = async (
  response: Response,
  input: { readonly apiBaseUrl: string; readonly webUrl: string },
): Promise<Response> => {
  if (response.status !== 200) return response
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("json")) {
    return response
  }

  const text = await response.clone().text()
  let metadata: unknown
  try {
    metadata = JSON.parse(text)
  } catch {
    return response
  }

  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return response
  }

  const body = JSON.stringify({
    ...(metadata as Record<string, unknown>),
    agent_auth: agentAuthBlock(input),
  })
  const headers = new Headers(response.headers)
  headers.set("content-type", "application/json; charset=utf-8")
  headers.delete("content-length")

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
