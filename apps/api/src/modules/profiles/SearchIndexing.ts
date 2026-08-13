// The search-indexing rule for a Public Profile, fixed by ADR 0016: a profile
// becomes eligible for search indexing when its Account is at least 7 days old
// and has at least 5 public Saved Items. The API decides it and returns a
// boolean, so the web layer renders a robots directive from a value and owns no
// part of the rule.

export const INDEXABLE_MIN_ACCOUNT_AGE_DAYS = 7
export const INDEXABLE_MIN_PUBLIC_SAVED_ITEMS = 5

const DAY_MS = 24 * 60 * 60 * 1000

export const isIndexable = (input: {
  readonly joinedAt: Date
  readonly publicSavedItemCount: number
  readonly now: Date
}): boolean =>
  input.publicSavedItemCount >= INDEXABLE_MIN_PUBLIC_SAVED_ITEMS &&
  input.now.getTime() - input.joinedAt.getTime() >=
    INDEXABLE_MIN_ACCOUNT_AGE_DAYS * DAY_MS
