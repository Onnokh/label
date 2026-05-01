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

const corsHeaders = (request: Request, trustedOrigins: readonly string[]) => {
  const origin = request.headers.get("origin")
  const headers = new Headers({
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "set-auth-token",
    vary: "Origin",
  })

  if (origin && trustedOrigins.includes(origin)) {
    headers.set("access-control-allow-origin", origin)
  }

  return headers
}

const withCors = async (
  request: Request,
  trustedOrigins: readonly string[],
  handle: (request: Request) => Promise<Response>,
) => {
  const headersToAdd = corsHeaders(request, trustedOrigins)

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headersToAdd })
  }

  const response = await handle(request)
  const headers = new Headers(response.headers)
  headersToAdd.forEach((value, key) => headers.set(key, value))

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const withSessionBearer = async (
  request: Request,
  auth: {
    readonly api: {
      readonly getSession: (input: { readonly headers: Headers }) => Promise<{
        readonly session?: { readonly token?: string } | null
      } | null>
    }
  },
) => {
  if (request.headers.has("authorization")) {
    return request
  }

  const session = await auth.api.getSession({ headers: request.headers })
  const token = session?.session?.token

  if (!token) {
    return request
  }

  const headers = new Headers(request.headers)
  headers.set("authorization", `Bearer ${token}`)

  return new Request(request, { headers })
}

const program = Effect.gen(function* () {
  const config = yield* AppConfig
  const context = yield* Effect.context<
    AuthHandler | BetterAuth | CaptureService | SavedItemRepository
  >()
  const authHandler = yield* AuthHandler
  const { auth } = yield* BetterAuth
  const httpEffect = yield* HttpRouter.toHttpEffect(httpAppLayer)
  const apiFetch = HttpEffect.toWebHandler(Effect.provideContext(httpEffect, context))

  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: config.http.port,
        fetch: (request) =>
          withCors(
            request,
            config.auth.trustedOrigins,
            new URL(request.url).pathname.startsWith("/api/auth/")
              ? authHandler.handle
              : (request) =>
                  withSessionBearer(request, auth).then((requestWithAuth) =>
                    apiFetch(requestWithAuth),
                  ),
          ),
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
