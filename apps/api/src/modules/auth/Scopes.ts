import { Context, Data, Effect } from "effect"

export const V1_SCOPES = [
  "saved-items:capture",
  "saved-items:read",
  "saved-items:write",
  "saved-items:delete",
  "folders:read",
  "folders:write",
  "folders:delete",
  "account:read",
] as const

export type Scope = (typeof V1_SCOPES)[number]

export const V1_SCOPE_DESCRIPTIONS = {
  "saved-items:capture": "Save a URL to the Account's read-later queue.",
  "saved-items:read": "List and read the Account's Saved Items.",
  "saved-items:write": "Update Saved Items, including read state, Source, and Folder assignment.",
  "saved-items:delete": "Delete Saved Items from the Account.",
  "folders:read": "List the Account's Folders.",
  "folders:write": "Create and update Folders.",
  "folders:delete": "Delete Folders while keeping their Saved Items.",
  "account:read": "Read the identity of the authenticated Account.",
} satisfies Record<Scope, string>

// Standard OAuth2/OIDC protocol scopes the provider must advertise, kept
// separate from the domain scopes above. `offline_access` is the spec-defined
// scope that makes the token endpoint issue a refresh token — without it in the
// provider's allowlist, clients only ever get short-lived access tokens.
export const OAUTH_PROTOCOL_SCOPES = ["offline_access"] as const

export type AuthContextValue =
  | { readonly kind: "session" }
  | { readonly kind: "apiKey" | "oauth"; readonly scopes: ReadonlySet<Scope> }

export class AuthContext extends Context.Service<AuthContext, AuthContextValue>()(
  "@app/api/AuthContext",
) {}

export class MissingScope extends Data.TaggedError("MissingScope")<{
  readonly scope: Scope
}> {}

export const requireScope = (scope: Scope): Effect.Effect<void, MissingScope, AuthContext> =>
  Effect.gen(function* () {
    const ctx = yield* AuthContext
    const granted = ctx.kind === "session" || ctx.scopes.has(scope)
    if (!granted) return yield* new MissingScope({ scope })
  })

// Grant access when the caller holds ANY of the listed scopes. Useful where one
// capability has more than one acceptable scope (e.g. a destructive action
// reachable via either a broad :write grant or a dedicated :delete grant).
export const requireAnyScope = (
  scopes: readonly [Scope, ...Scope[]],
): Effect.Effect<void, MissingScope, AuthContext> =>
  Effect.gen(function* () {
    const ctx = yield* AuthContext
    const granted = ctx.kind === "session" || scopes.some((scope) => ctx.scopes.has(scope))
    if (!granted) return yield* new MissingScope({ scope: scopes[0] })
  })

const V1_SCOPE_SET = new Set<Scope>(V1_SCOPES)

export const permissionsToScopes = (
  permissions: Record<string, string[]> | null | undefined,
): ReadonlySet<Scope> => {
  if (!permissions) return new Set()
  const out = new Set<Scope>()
  for (const [resource, actions] of Object.entries(permissions)) {
    for (const action of actions) {
      const candidate = `${resource}:${action}` as Scope
      if (V1_SCOPE_SET.has(candidate)) out.add(candidate)
    }
  }
  return out
}

export const scopesToPermissions = (scopes: ReadonlyArray<Scope>): Record<string, string[]> => {
  const grouped: Record<string, string[]> = {}
  for (const scope of scopes) {
    const [resource, action] = scope.split(":") as [string, string]
    const bucket = grouped[resource] ?? (grouped[resource] = [])
    if (!bucket.includes(action)) bucket.push(action)
  }
  return grouped
}
