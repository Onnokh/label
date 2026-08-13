import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { sleevyApi } from "./ApiContract.js"
import { SessionOnlyAuthLive, SessionOrApiKeyAuthLive } from "./AuthMiddleware.js"
import { capturesGroupLive } from "./CapturesHandlers.js"
import { foldersGroupLive } from "./FoldersHandlers.js"
import { connectAuthorizeGroupLive, connectExchangeGroupLive } from "./ConnectHandlers.js"
import { healthGroupLive } from "./HealthHandlers.js"
import { profileGroupLive } from "./ProfileHandlers.js"
import { publicProfilesGroupLive } from "./PublicProfileHandlers.js"
import { savedItemsGroupLive } from "./SavedItemsHandlers.js"

const groupLives = Layer.mergeAll(
  healthGroupLive,
  capturesGroupLive,
  foldersGroupLive,
  profileGroupLive,
  publicProfilesGroupLive,
  savedItemsGroupLive,
  connectAuthorizeGroupLive,
  connectExchangeGroupLive,
)

export const sleevyApiHandlers = groupLives.pipe(
  Layer.provide(SessionOrApiKeyAuthLive),
  Layer.provide(SessionOnlyAuthLive),
)

export const sleevyApiLive = HttpApiBuilder.layer(sleevyApi, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide(sleevyApiHandlers))
