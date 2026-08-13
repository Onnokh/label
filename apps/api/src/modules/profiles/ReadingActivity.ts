import { and, eq, sql, type SQLWrapper } from "drizzle-orm"

import type { UserId } from "../../domain/SavedItem.js"
import { savedItemsTable } from "../persistence/schema.js"

// The one place that says which saves Reading Activity counts. ADR 0016 fixes
// the rule: first captures only, bucketed by Saved Item creation time in UTC,
// over a rolling 52 weeks.
//
// Of the two clauses of publicSavedItemFilter only Profile Visibility survives
// here, and it arrives through the Handle lookup rather than through this
// filter: the grid counts every Saved Item, including one in no Folder and one
// inside a Folder nobody published. A count is not a URL, and a grid restricted
// to the items the list shows would be too empty to be worth drawing. There is
// no switch to hide it. So the grid may show a save the item list withholds,
// which is intended.
//
// Every Saved Item row is one first capture. A Duplicate Save updates
// `last_saved_at` on the row it found and inserts nothing, so counting rows by
// `created_at` counts first captures by construction. Bucketing by Last Saved At
// would instead move a count from its own day to today every time an old Link
// returns, silently rewriting the past.
const READING_ACTIVITY_WEEKS = 52
export const READING_ACTIVITY_DAYS = READING_ACTIVITY_WEEKS * 7

// Postgres owns the window: the codebase reads the wall clock directly and has
// no injected clock, so the database clock is the only one a test can aim at by
// choosing row timestamps. `now() at time zone 'utc'` is used rather than `current_date`
// because the session timezone must not decide which day a save lands in.
const UTC_TODAY = sql`(now() at time zone 'utc')::date`

// Both bounds are inclusive UTC days, so the window spans exactly 52 weeks.
// The parentheses are load-bearing: AT TIME ZONE binds tighter than `-`, so an
// unwrapped subtraction would attach the zone to the interval instead.
const WINDOW_START =
  sql`(${UTC_TODAY} - interval '${sql.raw(String(READING_ACTIVITY_DAYS - 1))} days')`

// Both bounds leave as `YYYY-MM-DD` text, which is what the wire carries: a day
// is a day for every visitor, not an instant to be read again in a timezone.
export const readingActivityFrom = sql<string>`to_char(${WINDOW_START}, 'YYYY-MM-DD')`
export const readingActivityTo = sql<string>`to_char(${UTC_TODAY}, 'YYYY-MM-DD')`

// The UTC calendar day a Saved Item was created on. Grouping and ordering use
// the day itself; the response carries its text form.
export const readingActivityDay =
  sql`(${savedItemsTable.createdAt} at time zone 'utc')::date`

// Nullable because the Handle lookup reaches the Saved Items through a left
// join, so an Account with no save inside the window still answers with a row.
export const readingActivityDayText =
  sql<string | null>`to_char(${readingActivityDay}, 'YYYY-MM-DD')`

// `owner` is the Account whose saves are counted. It takes a plain UserId for a
// direct query, or a column for a join.
export const readingActivityFilter = (owner: UserId | SQLWrapper) =>
  and(
    eq(savedItemsTable.userId, owner),
    sql`${savedItemsTable.createdAt} >= (${WINDOW_START} at time zone 'utc')`,
  )
