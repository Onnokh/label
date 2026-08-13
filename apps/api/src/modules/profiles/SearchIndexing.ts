// The search-indexing rule for a Public Profile, fixed by ADR 0016: a profile
// becomes eligible for search indexing when its Account is at least 7 days old
// and has at least 5 public Saved Items. The API decides it and returns a
// boolean, so the web layer renders a robots directive from a value and owns no
// part of the rule.

const MIN_ACCOUNT_AGE_DAYS = 7
const MIN_PUBLIC_SAVED_ITEMS = 5

const DAY_MS = 24 * 60 * 60 * 1000

// The wall clock is read here rather than passed in, the way the rest of the
// codebase reads it. The boundaries are proven through the route.
export const isIndexable = (profile: {
  readonly joinedAt: Date
  readonly publicSavedItemCount: number
}): boolean =>
  profile.publicSavedItemCount >= MIN_PUBLIC_SAVED_ITEMS &&
  Date.now() - profile.joinedAt.getTime() >= MIN_ACCOUNT_AGE_DAYS * DAY_MS
