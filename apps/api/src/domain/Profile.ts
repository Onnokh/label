import { Schema } from "effect"
import { ProfileVisibility } from "@sleevy/contract"

import { UserId } from "./SavedItem.js"

// Re-export the contract's enum schema so domain consumers keep their existing
// import path. The source of truth lives in @sleevy/contract.
export { ProfileVisibility }

export const ProfileId = Schema.String.pipe(Schema.brand("ProfileId"))
export type ProfileId = typeof ProfileId.Type

// One record per Account, created when the Account claims its Handle. The
// record outlives turning Profile Visibility off, so a private Account keeps
// its Handle reserved; only deleting the Account releases it.
export class Profile extends Schema.Class<Profile>("Profile")({
  id: ProfileId,
  userId: UserId,
  handle: Schema.String,
  visibility: ProfileVisibility,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}
