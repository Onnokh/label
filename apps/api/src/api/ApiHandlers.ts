import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpServerRequest } from "effect/unstable/http"

import { SavedItem, type UserId } from "../domain/SavedItem.js"
import { BetterAuth } from "../modules/auth/BetterAuth.js"
import { CaptureService } from "../modules/capture/CaptureService.js"
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js"
import {
  CaptureCreated,
  CaptureUpdated,
  CurrentUser,
  InvalidUrlError,
  SavedItemNotFoundError,
  SavedItemsResponse,
  SessionOrApiKeyAuth,
  Unauthorized,
  labelApi,
  savedItemToDto,
} from "./ApiContract.js"

const extractBearer = (headers: Record<string, string>) => {
  const authHeader = headers.authorization ?? headers.Authorization
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]
}

export const SessionOrApiKeyAuthLive = Layer.effect(SessionOrApiKeyAuth)(
  Effect.gen(function* () {
    const { auth } = yield* BetterAuth

    return SessionOrApiKeyAuth.of((handler) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const webHeaders = new Headers(request.headers as Record<string, string>)

        const userId = yield* Effect.tryPromise({
          try: async (): Promise<UserId> => {
            const session = await auth.api.getSession({ headers: webHeaders })
            if (session?.user?.id) {
              return session.user.id as UserId
            }

            const bearer = extractBearer(request.headers as Record<string, string>)
            if (!bearer) {
              throw new Error("missing")
            }

            const verified = await auth.api.verifyApiKey({ body: { key: bearer } })
            if (!verified.valid || verified.error !== null || verified.key === null) {
              throw new Error("invalid")
            }
            return verified.key.referenceId as UserId
          },
          catch: () => new Unauthorized({ message: "Missing or invalid credentials." }),
        })

        return yield* Effect.provideService(handler, CurrentUser, userId)
      }),
    )
  }),
)

const capturesGroupLive = HttpApiBuilder.group(labelApi, "captures", (handlers) =>
  handlers.handle("capture", ({ payload }) =>
    Effect.gen(function* () {
      const capture = yield* CaptureService
      const userId = yield* CurrentUser
      const result = yield* capture.capture(userId, payload.url).pipe(
        Effect.catchTags({
          InvalidUrl: (error) => Effect.fail(new InvalidUrlError({ url: error.url })),
          EffectDrizzleQueryError: Effect.die,
          SqlError: Effect.die,
        }),
      )
      const savedItem = savedItemToDto(result.savedItem)
      return result.captureResult === "created"
        ? new CaptureCreated({ savedItem, captureResult: "created" })
        : new CaptureUpdated({ savedItem, captureResult: "updated" })
    }),
  ),
)

const savedItemsGroupLive = HttpApiBuilder.group(labelApi, "saved-items", (handlers) =>
  handlers
    .handle("list", () =>
      Effect.gen(function* () {
        const repo = yield* SavedItemRepository
        const userId = yield* CurrentUser
        const items = yield* repo.listByUser(userId).pipe(Effect.orDie)
        return new SavedItemsResponse({ savedItems: items.map(savedItemToDto) })
      }),
    )
    .handle("markOpened", ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* SavedItemRepository
        const item = yield* repo.findById(params.id).pipe(Effect.orDie)
        if (item._tag === "None") {
          return yield* new SavedItemNotFoundError({ savedItemId: params.id })
        }
        const updated = yield* repo
          .update(
            new SavedItem({
              ...item.value,
              isRead: true,
              updatedAt: new Date(),
            }),
          )
          .pipe(Effect.orDie)
        return savedItemToDto(updated)
      }),
    )
    .handle("remove", ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* SavedItemRepository
        yield* repo.delete(params.id).pipe(Effect.orDie)
      }),
    ),
)

const groupLives = Layer.mergeAll(
  capturesGroupLive,
  savedItemsGroupLive,
)

export const labelApiHandlers = groupLives.pipe(Layer.provide(SessionOrApiKeyAuthLive))

export const labelApiLive = HttpApiBuilder.layer(labelApi, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide(labelApiHandlers))
