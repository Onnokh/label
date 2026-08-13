import { and, eq, sql, type SQLWrapper } from "drizzle-orm"

import type { UserId } from "../../domain/SavedItem.js"
import { foldersTable, profilesTable, savedItemsTable } from "../persistence/schema.js"

// The one place that says which Saved Items a Public Profile shows. ADR 0016
// fixes the rule: Profile Visibility is public, the item is not a Private Saved
// Item, its Folder is not a Private Folder, and it was created more than an hour
// ago. The published count and the published page both resolve it in SQL through
// this filter, so neither can drift from the other. Reading Activity keeps only
// the Profile Visibility part of it, for the reason given in ReadingActivity.ts.

// Postgres owns the one-hour boundary. The codebase reads the wall clock
// directly and has no injected clock, so `now()` in the database is the only
// boundary a test can control by choosing row timestamps.
const PUBLISH_DELAY = "1 hour"

// `owner` is the Account whose Saved Items are counted or listed. It takes a
// plain UserId for a direct query, or a column for a correlated subquery.
export const publicSavedItemFilter = (owner: UserId | SQLWrapper) =>
  and(
    eq(savedItemsTable.userId, owner),
    eq(savedItemsTable.isPrivate, false),
    // The Folder and Profile rules are subqueries rather than joins, so a
    // caller cannot forget a join and silently publish withheld items. The
    // inner tables are aliased because `profiles` is also the outer table of
    // the profile lookup.
    sql`not exists (
      select 1 from ${foldersTable} private_folder
      where private_folder.id = ${savedItemsTable.folderId}
        and private_folder.is_private
    )`,
    sql`exists (
      select 1 from ${profilesTable} owner_profile
      where owner_profile.user_id = ${savedItemsTable.userId}
        and owner_profile.visibility = 'public'
    )`,
    sql`${savedItemsTable.createdAt} < now() - interval '${sql.raw(PUBLISH_DELAY)}'`,
  )

// A Public Profile is read one numbered page at a time, 50 Saved Items to a
// page. Page numbers rather than a cursor, because a crawler cannot reach
// infinite scroll: every page has to be an address a visitor can share.
export const PUBLIC_SAVED_ITEMS_PAGE_SIZE = 50

// The page a request asks for. Page 1 is the newest page. A missing number, a
// fractional one, and anything below the first page all read as the first page:
// these URLs are typed and edited by hand, so a Public Profile answers with its
// first page rather than with an error.
export const requestedPage = (asked: number | undefined): number =>
  asked === undefined ? 1 : Math.max(1, Math.trunc(asked))

// How many numbered pages a Public Profile has. A profile that publishes nothing
// still has one page, so page 1 is always an address that answers.
export const pageCount = (totalCount: number): number =>
  Math.max(1, Math.ceil(totalCount / PUBLIC_SAVED_ITEMS_PAGE_SIZE))
