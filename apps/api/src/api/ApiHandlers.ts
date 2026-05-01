import { Effect, Layer, Option, Redacted } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { SavedItem } from "../domain/SavedItem.js"
import { AuthService, Unauthorized as AuthUnauthorized } from "../modules/auth/AuthService.js"
import { CaptureService } from "../modules/capture/CaptureService.js"
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js"
import {
  CaptureCreated,
  CaptureTokenAuth,
  CaptureUpdated,
  CreateCaptureTokenResponse,
  CurrentAccount,
  InvalidUrlError,
  SavedItemNotFoundError,
  SavedItemsResponse,
  TrustedAccountAuth,
  Unauthorized,
  labelApi,
  savedItemToDto,
} from "./ApiContract.js"

const toApiUnauthorized = (error: AuthUnauthorized) =>
  Effect.fail(new Unauthorized({ message: error.message }))

export const CaptureTokenAuthLive = Layer.effect(CaptureTokenAuth)(
  Effect.gen(function* () {
    const auth = yield* AuthService
    return CaptureTokenAuth.of({
      bearer: (handler, { credential }) =>
        auth
          .authenticateCaptureToken(`Bearer ${Redacted.value(credential)}`)
          .pipe(
            Effect.catchTag("Unauthorized", toApiUnauthorized),
            Effect.orDie,
            Effect.flatMap((accountId) =>
              Effect.provideService(handler, CurrentAccount, accountId),
            ),
          ),
    })
  }),
)

export const TrustedAccountAuthLive = Layer.effect(TrustedAccountAuth)(
  Effect.gen(function* () {
    const auth = yield* AuthService
    return TrustedAccountAuth.of({
      accountId: (handler, { credential }) =>
        auth.accountIdFromTrustedHeader(Redacted.value(credential)).pipe(
          Effect.catchTag("Unauthorized", toApiUnauthorized),
          Effect.flatMap((accountId) =>
            Effect.provideService(handler, CurrentAccount, accountId),
          ),
        ),
    })
  }),
)

const captureTokensGroupLive = HttpApiBuilder.group(labelApi, "capture-tokens", (handlers) =>
  handlers.handle("create", ({ payload }) =>
    Effect.gen(function* () {
      const auth = yield* AuthService
      const result = yield* auth
        .issueCaptureTokenForGoogleAccount({
          googleSubject: payload.googleSubject,
          email: payload.email,
        })
        .pipe(Effect.orDie)
      return new CreateCaptureTokenResponse({
        accountId: result.account.id,
        captureToken: result.rawToken,
      })
    }),
  ),
)

const capturesGroupLive = HttpApiBuilder.group(labelApi, "captures", (handlers) =>
  handlers.handle("capture", ({ payload }) =>
    Effect.gen(function* () {
      const capture = yield* CaptureService
      const accountId = yield* CurrentAccount
      const result = yield* capture.capture(accountId, payload.url).pipe(
        Effect.catchTag("InvalidUrl", (error) =>
          Effect.fail(new InvalidUrlError({ url: error.url })),
        ),
        Effect.orDie,
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
        const accountId = yield* CurrentAccount
        const items = yield* repo.listByAccount(accountId).pipe(Effect.orDie)
        return new SavedItemsResponse({ savedItems: items.map(savedItemToDto) })
      }),
    )
    .handle("markOpened", ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* SavedItemRepository
        const item = yield* repo.findById(params.id).pipe(Effect.orDie)
        if (Option.isNone(item)) {
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
  captureTokensGroupLive,
  capturesGroupLive,
  savedItemsGroupLive,
)

const authLives = Layer.mergeAll(CaptureTokenAuthLive, TrustedAccountAuthLive)

export const labelApiHandlers = groupLives.pipe(Layer.provide(authLives))

export const labelApiLive = HttpApiBuilder.layer(labelApi, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide(labelApiHandlers))
