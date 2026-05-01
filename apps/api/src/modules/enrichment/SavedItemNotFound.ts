import { Data } from "effect"

import type { SavedItemId } from "../../domain/SavedItem.js"

export class SavedItemNotFound extends Data.TaggedError("SavedItemNotFound")<{
  readonly savedItemId: SavedItemId
}> {}
