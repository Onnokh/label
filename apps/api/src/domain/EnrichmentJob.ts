import { Schema } from "effect";

import { SavedItemId } from "./SavedItem.js";

export const EnrichmentJobId = Schema.String.pipe(
  Schema.brand("EnrichmentJobId"),
);
export type EnrichmentJobId = typeof EnrichmentJobId.Type;

export const EnrichmentJobStatus = Schema.Literals([
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
]);
export type EnrichmentJobStatus = typeof EnrichmentJobStatus.Type;

export const EnrichmentStageName = Schema.Literals([
  "metadata",
  "content",
  "categorization",
  "preview-summary",
]);
export type EnrichmentStageName = typeof EnrichmentStageName.Type;

export const EnrichmentStageStatus = Schema.Literals([
  "succeeded",
  "failed",
  "skipped",
]);
export type EnrichmentStageStatus = typeof EnrichmentStageStatus.Type;

export class EnrichmentStageResult extends Schema.Class<EnrichmentStageResult>(
  "EnrichmentStageResult",
)({
  stage: EnrichmentStageName,
  status: EnrichmentStageStatus,
  message: Schema.optional(Schema.String),
  startedAt: Schema.Date,
  completedAt: Schema.Date,
}) {}

export class EnrichmentJob extends Schema.Class<EnrichmentJob>("EnrichmentJob")(
  {
    id: EnrichmentJobId,
    savedItemId: SavedItemId,
    attempt: Schema.Int,
    status: EnrichmentJobStatus,
    stages: Schema.Array(EnrichmentStageResult),
    queuedAt: Schema.Date,
    startedAt: Schema.optional(Schema.Date),
    completedAt: Schema.optional(Schema.Date),
  },
) {}
