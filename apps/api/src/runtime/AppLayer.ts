import { Layer } from "effect";

import { aiEnricherLayer } from "../modules/ai/AiEnricher.js";
import { SavedItemIntakeLayer } from "../modules/saved-items/SavedItemIntake.js";
import { captureServiceLayer } from "../modules/capture/CaptureService.js";
import { contentExtractorLayer } from "../modules/content/ContentExtractor.js";
import { enrichmentWorkflowLayer } from "../modules/enrichment/EnrichmentWorkflow.js";
import { pageFetcherLayer } from "../modules/fetch/PageFetcher.js";
import { metadataFetcherLayer } from "../modules/metadata/MetadataFetcher.js";
import { sqliteClientLayer } from "../modules/persistence/SqliteClient.js";
import { AppConfig } from "./Config.js";

export const appLayer = Layer.mergeAll(
  captureServiceLayer,
  enrichmentWorkflowLayer,
).pipe(
  Layer.provideMerge(SavedItemIntakeLayer),
  Layer.provideMerge(pageFetcherLayer),
  Layer.provideMerge(metadataFetcherLayer),
  Layer.provideMerge(contentExtractorLayer),
  Layer.provideMerge(aiEnricherLayer),
  Layer.provideMerge(sqliteClientLayer),
  Layer.provideMerge(AppConfig.layer),
);
