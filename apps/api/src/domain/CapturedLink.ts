import { Schema } from "effect";

import { SavedItemId } from "./SavedItem.js";

export const CapturedLinkId = Schema.String.pipe(
  Schema.brand("CapturedLinkId"),
);
export type CapturedLinkId = typeof CapturedLinkId.Type;

export class CapturedLink extends Schema.Class<CapturedLink>("CapturedLink")({
  id: CapturedLinkId,
  savedItemId: SavedItemId,
  url: Schema.String,
  capturedAt: Schema.Date,
}) {}
