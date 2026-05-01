import { Context, Data, Effect, Layer, Option } from "effect"

import type { AccountId } from "../../domain/SavedItem.js"
import { AccountRepository } from "../accounts/AccountRepository.js"

export class Unauthorized extends Data.TaggedError("Unauthorized")<{
  readonly message: string
}> {}

export class AuthService extends Context.Service<AuthService>()(
  "@app/modules/auth/AuthService",
  {
    make: Effect.gen(function* () {
      const accounts = yield* AccountRepository

      return {
        authenticateCaptureToken: (authorization: string | undefined) =>
          Effect.gen(function* () {
            const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]

            if (!token) {
              return yield* new Unauthorized({ message: "Missing bearer token." })
            }

            const captureToken = yield* accounts.findByCaptureToken(token)

            if (Option.isNone(captureToken)) {
              return yield* new Unauthorized({ message: "Invalid bearer token." })
            }

            return captureToken.value.accountId
          }),

        issueCaptureTokenForGoogleAccount: (input: {
          readonly googleSubject: string
          readonly email: string
        }) =>
          Effect.gen(function* () {
            const account = yield* accounts.upsertGoogleAccount(input)
            const token = yield* accounts.regenerateCaptureToken(account.id)
            return { account, ...token }
          }),

        accountIdFromTrustedHeader: (value: string | undefined): Effect.Effect<AccountId, Unauthorized> =>
          value
            ? Effect.succeed(value as AccountId)
            : Effect.fail(new Unauthorized({ message: "Missing account header." })),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(AuthService, AuthService.make)
}
