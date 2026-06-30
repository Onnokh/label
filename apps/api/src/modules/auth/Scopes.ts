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

export type AuthContextValue =
  | { readonly kind: "session" }
  | { readonly kind: "apiKey"; readonly scopes: ReadonlySet<Scope> }

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
