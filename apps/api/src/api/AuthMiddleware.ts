import { Effect, Layer } from "effect"
import { HttpServerRequest } from "effect/unstable/http"

import type { UserId } from "../domain/SavedItem.js"
import { BetterAuth } from "../modules/auth/BetterAuth.js"
import {
  AuthContext,
  type AuthContextValue,
  type Scope,
  permissionsToScopes,
  requireAnyScope,
  requireScope,
} from "../modules/auth/Scopes.js"
import { CurrentUser, SessionOnlyAuth, SessionOrApiKeyAuth, Unauthorized } from "./ApiContract.js"

const bearerCredential = (authorization: string | null | undefined) =>
  authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null

const isSignedSessionToken = (credential: string) => credential.includes(".")

type AuthResolution = {
  readonly userId: UserId
  readonly userEmail: string | undefined
  readonly authContext: AuthContextValue
}

export const SessionOrApiKeyAuthLive = Layer.effect(SessionOrApiKeyAuth)(
  Effect.gen(function* () {
    const { auth } = yield* BetterAuth

    return SessionOrApiKeyAuth.of({
      bearer: (handler) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const webHeaders = new Headers(request.headers as Record<string, string>)
          const credential = bearerCredential(webHeaders.get("authorization"))

          const resolution = yield* Effect.tryPromise({
            try: async (): Promise<AuthResolution> => {
              if (credential && !isSignedSessionToken(credential)) {
                const result = await auth.api.verifyApiKey({
                  body: { key: credential },
                })
                if (!result.valid || !result.key) throw new Error("missing")
                return {
                  userId: result.key.referenceId as UserId,
                  userEmail: undefined,
                  authContext: {
                    kind: "apiKey",
                    scopes: permissionsToScopes(result.key.permissions ?? null),
                  },
                }
              }

              const session = await auth.api.getSession({ headers: webHeaders })
              if (session?.user?.id) {
                return {
                  userId: session.user.id as UserId,
                  userEmail: session.user.email,
                  authContext: { kind: "session" },
                }
              }

              throw new Error("missing")
            },
            catch: () => new Unauthorized({ message: "Missing or invalid credentials." }),
          })

          return yield* handler.pipe(
            Effect.provideService(CurrentUser, resolution.userId),
            Effect.provideService(AuthContext, resolution.authContext),
            Effect.annotateLogs(resolution.userEmail ? { user: resolution.userEmail } : {}),
          )
        }),
    })
  }),
)

export const SessionOnlyAuthLive = Layer.effect(SessionOnlyAuth)(
  Effect.gen(function* () {
    const { auth } = yield* BetterAuth

    return SessionOnlyAuth.of({
      bearer: (handler) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const webHeaders = new Headers(request.headers as Record<string, string>)

          const resolution = yield* Effect.tryPromise({
            try: async () => {
              const session = await auth.api.getSession({ headers: webHeaders })
              if (!session?.user?.id) throw new Error("missing")
              return {
                userId: session.user.id as UserId,
                userEmail: session.user.email,
              }
            },
            catch: () => new Unauthorized({ message: "Sign in required." }),
          })

          return yield* handler.pipe(
            Effect.provideService(CurrentUser, resolution.userId),
            Effect.annotateLogs({ user: resolution.userEmail }),
          )
        }),
    })
  }),
)

export const gated =
  <A, E, R, Args extends unknown[]>(
    scope: Scope,
    handler: (...args: Args) => Effect.Effect<A, E, R>,
  ) =>
  (...args: Args): Effect.Effect<A, E | Unauthorized, R | AuthContext> =>
    Effect.gen(function* () {
      yield* requireScope(scope).pipe(
        Effect.mapError(
          (e) => new Unauthorized({ message: `Missing required scope: ${e.scope}.` }),
        ),
      )
      return yield* handler(...args)
    })

// Like `gated`, but the caller passes if they hold ANY of the listed scopes.
export const gatedAny =
  <A, E, R, Args extends unknown[]>(
    scopes: readonly [Scope, ...Scope[]],
    handler: (...args: Args) => Effect.Effect<A, E, R>,
  ) =>
  (...args: Args): Effect.Effect<A, E | Unauthorized, R | AuthContext> =>
    Effect.gen(function* () {
      yield* requireAnyScope(scopes).pipe(
        Effect.mapError(
          () => new Unauthorized({ message: `Missing required scope: one of ${scopes.join(", ")}.` }),
        ),
      )
      return yield* handler(...args)
    })
