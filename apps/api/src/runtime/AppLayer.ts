import { Layer } from "effect";

import { Analytics } from "../modules/analytics/Analytics.js";
import { AuthHandler } from "../modules/auth/AuthHandler.js";
import { BetterAuth } from "../modules/auth/BetterAuth.js";
import { CaptureService } from "../modules/capture/CaptureService.js";
import { ConnectCodeRepository } from "../modules/connect/ConnectCodeRepository.js";
import { EnrichmentWorkflow } from "../modules/enrichment/EnrichmentWorkflow.js";
import { FolderRepository } from "../modules/folders/FolderRepository.js";
import { McpTools } from "../modules/mcp/McpTools.js";
import { ProfileRepository } from "../modules/profiles/ProfileRepository.js";
import { PublicProfileRepository } from "../modules/profiles/PublicProfileRepository.js";
import { ApiKeyRateLimiter } from "../modules/rate-limit/ApiKeyRateLimiter.js";
import { BearerRateLimiter } from "../modules/rate-limit/BearerRateLimiter.js";
import { ConnectAuthorizeRateLimiter } from "../modules/rate-limit/ConnectAuthorizeRateLimiter.js";
import { ConnectExchangeRateLimiter } from "../modules/rate-limit/ConnectExchangeRateLimiter.js";
import { PublicProfileRateLimiter } from "../modules/rate-limit/PublicProfileRateLimiter.js";
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js";
import { AppConfig } from "./Config.js";

// Each service exposes a self-contained `defaultLayer` that provides its own
// dependencies, so this root is an order-independent merge — adding or
// reordering services never breaks wiring. Shared dependencies (AppConfig,
// PostgresClient/SharedPool) are memoized by layer identity within the single
// runtime build, so exactly one instance of each is created and reused across
// every service that depends on it.
//
// Only services consumed outside their own dependents are listed here; internal
// dependencies (PostgresClient, SavedItemIntake, CaptureServiceStore, the
// fetchers, etc.) stay encapsulated inside the `defaultLayer`s above.
export const appLayer = Layer.mergeAll(
  AppConfig.layer,
  Analytics.defaultLayer,
  ApiKeyRateLimiter.defaultLayer,
  AuthHandler.defaultLayer,
  BearerRateLimiter.defaultLayer,
  BetterAuth.defaultLayer,
  CaptureService.defaultLayer,
  ConnectAuthorizeRateLimiter.defaultLayer,
  ConnectCodeRepository.defaultLayer,
  ConnectExchangeRateLimiter.defaultLayer,
  EnrichmentWorkflow.defaultLayer,
  FolderRepository.defaultLayer,
  McpTools.defaultLayer,
  ProfileRepository.defaultLayer,
  PublicProfileRateLimiter.defaultLayer,
  PublicProfileRepository.defaultLayer,
  SavedItemRepository.defaultLayer,
);
