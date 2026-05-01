import { Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/unstable/http"

import { labelApiLive } from "../api/ApiHandlers.js"
import { AuthHandler } from "../modules/auth/AuthHandler.js"
import { BetterAuth } from "../modules/auth/BetterAuth.js"
import { CaptureService } from "../modules/capture/CaptureService.js"
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js"
import { AppConfig } from "./Config.js"
import { appLayer } from "./AppLayer.js"

const httpAppLayer = labelApiLive.pipe(
  Layer.provide(appLayer),
  Layer.provide(HttpServer.layerServices),
)

const program = Effect.gen(function* () {
  const config = yield* AppConfig
  const context = yield* Effect.context<
    AuthHandler | BetterAuth | CaptureService | SavedItemRepository
  >()
  const authHandler = yield* AuthHandler
  const httpEffect = yield* HttpRouter.toHttpEffect(httpAppLayer)
  const apiFetch = HttpEffect.toWebHandler(Effect.provideContext(httpEffect, context))

  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: config.http.port,
        fetch: (request) =>
          new URL(request.url).pathname.startsWith("/api/auth/")
            ? authHandler.handle(request)
            : apiFetch(request),
      }),
    ),
    (server) => Effect.promise(() => server.stop()),
  )

  const portlessUrl = process.env.PORTLESS_URL
  yield* Effect.log(
    portlessUrl 
      ? `Label API listening on ${portlessUrl} (portless)`
      : `Label API listening on ${server.url}`
  )
  return yield* Effect.never
})

export const main = program.pipe(Effect.provide(appLayer))
