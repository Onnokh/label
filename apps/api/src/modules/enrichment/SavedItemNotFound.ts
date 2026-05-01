import { Schema } from "effect"

import { SavedItemId } from "../../domain/SavedItem.js"

export class SavedItemNotFound extends Schema.TaggedError<SavedItemNotFound>()(
  "SavedItemNotFound",
  {
    savedItemId: SavedItemId,
  },
) { }
