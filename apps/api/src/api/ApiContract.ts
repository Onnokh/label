import { Context, Schema } from "effect"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from "effect/unstable/httpapi"

import { GeneratedType, SavedItemId, UserId } from "../domain/SavedItem.js"
import type { SavedItem } from "../domain/SavedItem.js"

export class SavedItemDto extends Schema.Class<SavedItemDto>("SavedItemDto")({
  id: SavedItemId,
  userId: UserId,
  originalUrl: Schema.String,
  normalizedUrl: Schema.String,
  host: Schema.String,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  siteName: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  canonicalUrl: Schema.optional(Schema.String),
  previewSummary: Schema.optional(Schema.String),
  generatedType: Schema.optional(GeneratedType),
  generatedTopics: Schema.Array(Schema.String),
  enrichmentStatus: Schema.Literals(["pending", "enriched", "failed"]),
  isRead: Schema.Boolean,
  lastSavedAt: Schema.Date,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export const savedItemToDto = (savedItem: SavedItem) => new SavedItemDto(savedItem)

export class CapturePayload extends Schema.Class<CapturePayload>("CapturePayload")({
  url: Schema.String,
}) {}

export class CaptureCreated extends Schema.Class<CaptureCreated>("CaptureCreated")({
  savedItem: SavedItemDto,
  captureResult: Schema.Literal("created"),
}, { httpApiStatus: 201 }) {}

export class CaptureUpdated extends Schema.Class<CaptureUpdated>("CaptureUpdated")({
  savedItem: SavedItemDto,
  captureResult: Schema.Literal("updated"),
}, { httpApiStatus: 200 }) {}

export class SavedItemsResponse extends Schema.Class<SavedItemsResponse>("SavedItemsResponse")({
  savedItems: Schema.Array(SavedItemDto),
}) {}

export class Unauthorized extends Schema.ErrorClass<Unauthorized>("Unauthorized")({
  _tag: Schema.tag("Unauthorized"),
  message: Schema.String,
}, { httpApiStatus: 401 }) {}

export class InvalidUrlError extends Schema.ErrorClass<InvalidUrlError>("InvalidUrlError")({
  _tag: Schema.tag("InvalidUrlError"),
  url: Schema.String,
}, { httpApiStatus: 400 }) {}

export class SavedItemNotFoundError extends Schema.ErrorClass<SavedItemNotFoundError>(
  "SavedItemNotFoundError",
)({
  _tag: Schema.tag("SavedItemNotFoundError"),
  savedItemId: SavedItemId,
}, { httpApiStatus: 404 }) {}

export class CurrentUser extends Context.Service<CurrentUser, UserId>()(
  "@app/api/CurrentUser",
) {}

export class SessionOrApiKeyAuth extends HttpApiMiddleware.Service<SessionOrApiKeyAuth, {
  provides: CurrentUser
}>()("@app/api/SessionOrApiKeyAuth", {
  security: { bearer: HttpApiSecurity.bearer },
  error: Unauthorized,
}) {}

const capturesGroup = HttpApiGroup.make("captures")
  .add(
    HttpApiEndpoint.post("capture", "/v1/captures", {
      payload: CapturePayload,
      success: [CaptureCreated, CaptureUpdated],
      error: InvalidUrlError,
    }),
  )
  .middleware(SessionOrApiKeyAuth)

const savedItemsGroup = HttpApiGroup.make("saved-items")
  .add(
    HttpApiEndpoint.get("list", "/v1/saved-items", {
      success: SavedItemsResponse,
    }),
  )
  .add(
    HttpApiEndpoint.post("markOpened", "/v1/saved-items/:id/open", {
      params: Schema.Struct({ id: SavedItemId }),
      success: SavedItemDto,
      error: SavedItemNotFoundError,
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/v1/saved-items/:id", {
      params: Schema.Struct({ id: SavedItemId }),
      success: HttpApiSchema.NoContent,
    }),
  )
  .middleware(SessionOrApiKeyAuth)

export const labelApi = HttpApi.make("LabelApi")
  .add(capturesGroup)
  .add(savedItemsGroup)
