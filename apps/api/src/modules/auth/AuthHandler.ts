import { Context, Effect, Layer } from "effect"

import { BetterAuth } from "./BetterAuth.js"

export class AuthHandler extends Context.Service<AuthHandler, {
  readonly handle: (request: Request) => Promise<Response>
}>()(
  "@app/modules/auth/AuthHandler",
  {
    make: Effect.gen(function* () {
      const { handler } = yield* BetterAuth
      return { handle: handler } as const
    }),
  },
) {
  static readonly layer = Layer.effect(AuthHandler, AuthHandler.make)
}
