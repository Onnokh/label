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

// How many Handles the listing route hands out at once. A sitemap file holds at
// most 50,000 URLs, so that is the ceiling a page may never cross; 1,000 divides
// it exactly, so a page never straddles two sitemap files. The smaller number is
// also what keeps one response small: this route needs no credentials, and a
// body carrying 50,000 entries is megabytes anybody may ask for, sixty times a
// minute.
export const INDEXABLE_PROFILES_PAGE_SIZE = 1_000

// How many Public Profiles one listing read looks at. `isIndexable` reads the
// wall clock, so the rule cannot move into SQL without becoming a second copy of
// itself; the query hands back public Handles and the rule filters them here.
// That is only safe while the number of rows is bounded, and one sitemap file's
// worth of URLs is the honest bound: nothing past it could be listed anyway.
export const MAX_INDEXABLE_PROFILES = 50_000
