import { and, eq, sql, type SQLWrapper } from "drizzle-orm"

import type { UserId } from "../../domain/SavedItem.js"
import { foldersTable, profilesTable, savedItemsTable } from "../persistence/schema.js"

// The one place that says which Saved Items a Public Profile shows. The rule is
// two clauses and nothing else: Profile Visibility is public, and the Saved Item
// is in a Folder whose publish flag is set. A Saved Item with no Folder is never
// public, because no Folder row can match a null `folder_id`. The published count
// and the published page both resolve it in SQL through this filter, so neither
// can drift from the other. Reading Activity keeps only the Profile Visibility
// part of it, for the reason given in ReadingActivity.ts.

// `owner` is the Account whose Saved Items are counted or listed. It takes a
// plain UserId for a direct query, or a column for a correlated subquery.
export const publicSavedItemFilter = (owner: UserId | SQLWrapper) =>
  and(
    eq(savedItemsTable.userId, owner),
    // The Folder and Profile rules are subqueries rather than joins, so a
    // caller cannot forget a join and silently publish withheld items. The
    // inner tables are aliased because `profiles` is also the outer table of
    // the profile lookup.
    sql`exists (
      select 1 from ${foldersTable} published_folder
      where published_folder.id = ${savedItemsTable.folderId}
        and published_folder.is_published
    )`,
    sql`exists (
      select 1 from ${profilesTable} owner_profile
      where owner_profile.user_id = ${savedItemsTable.userId}
        and owner_profile.visibility = 'public'
    )`,
  )

// A Public Profile is read one numbered page at a time, 50 Saved Items to a
// page. Page numbers rather than a cursor, because a crawler cannot reach
// infinite scroll: every page has to be an address a visitor can share.
export const PUBLIC_SAVED_ITEMS_PAGE_SIZE = 50

// No Account can fill this many pages, so a request beyond it asks for a page
// that cannot exist and reads as the last one instead. The cap is what keeps the
// page number safe to multiply into a SQL offset: these routes need no API Key,
// and an unbounded number reaches Postgres as an offset past the range of a
// bigint, which fails the query rather than returning an empty page.
const MAX_PAGE = 1_000_000

// The page a request asks for. Page 1 is the newest page. A missing number, a
// fractional one, anything below the first page, and anything past the cap all
// read as a page inside the range: these URLs are typed and edited by hand, so a
// Public Profile answers with a page rather than with an error.
export const requestedPage = (asked: number | undefined): number =>
  asked === undefined ? 1 : Math.min(MAX_PAGE, Math.max(1, Math.trunc(asked)))

// How many numbered pages a listing has. A listing that carries nothing still
// has one page, so page 1 is always an address that answers. The page size is a
// parameter because the published Saved Items of one Handle and the Handles a
// search engine may index are paged by different numbers but by the same rule.
export const pageCount = (
  totalCount: number,
  pageSize: number = PUBLIC_SAVED_ITEMS_PAGE_SIZE,
): number => Math.max(1, Math.ceil(totalCount / pageSize))
