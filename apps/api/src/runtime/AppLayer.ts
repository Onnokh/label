import { Layer } from "effect";

import { AiEnricher } from "../modules/ai/AiEnricher.js";
import { AccountRepository } from "../modules/accounts/AccountRepository.js";
import { AuthService } from "../modules/auth/AuthService.js";
import { SavedItemIntake } from "../modules/saved-items/SavedItemIntake.js";
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js";
import { CaptureService } from "../modules/capture/CaptureService.js";
import { ContentExtractor } from "../modules/content/ContentExtractor.js";
import { EnrichmentWorkflow } from "../modules/enrichment/EnrichmentWorkflow.js";
import { PageFetcher } from "../modules/fetch/PageFetcher.js";
import { MetadataFetcher } from "../modules/metadata/MetadataFetcher.js";
import { PostgresClient } from "../modules/persistence/PostgresClient.js";
import { AppConfig } from "./Config.js";

export const appLayer = Layer.mergeAll(
  CaptureService.layer,
  EnrichmentWorkflow.layer,
  AuthService.layer,
  SavedItemRepository.layer,
).pipe(
  Layer.provideMerge(AccountRepository.layer),
  Layer.provideMerge(SavedItemIntake.layer),
  Layer.provideMerge(PageFetcher.layer),
  Layer.provideMerge(MetadataFetcher.layer),
  Layer.provideMerge(ContentExtractor.layer),
  Layer.provideMerge(AiEnricher.layer),
  Layer.provideMerge(PostgresClient.layer),
  Layer.provideMerge(AppConfig.layer),
);
