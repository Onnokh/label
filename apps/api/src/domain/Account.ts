import { Schema } from "effect"

import { AccountId } from "./SavedItem.js"

export class Account extends Schema.Class<Account>("Account")({
  id: AccountId,
  googleSubject: Schema.String,
  email: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export const CaptureTokenId = Schema.String.pipe(Schema.brand("CaptureTokenId"))
export type CaptureTokenId = typeof CaptureTokenId.Type

export class CaptureToken extends Schema.Class<CaptureToken>("CaptureToken")({
  id: CaptureTokenId,
  accountId: AccountId,
  tokenHash: Schema.String,
  createdAt: Schema.Date,
  regeneratedAt: Schema.optional(Schema.Date),
}) {}
