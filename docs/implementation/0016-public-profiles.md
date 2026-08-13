# Opt-In Public Profiles Implementation Guide

This document turns [ADR 0016](../adr/0016-opt-in-public-profiles.md) into a delivery plan. The work splits into three slices. **Slice 1 is complete**; slices 2 and 3 are not started. The spec is [PLO-424](https://linear.app/plowski-inc/issue/PLO-424).

## Principles

- **Publishing is inverted.** Once Profile Visibility is public, every Saved Item is public unless the item is private, its Folder is private, or it was created less than an hour ago. The alternative — an audience decision on every Folder — was rejected because it overloads Folder, which exists to help its owner find things later.
- **One place decides what is public.** The four-part rule lives in a single SQL condition that every public read composes. A reader cannot restate part of it, and the Folder and Profile Visibility clauses are subqueries rather than joins, so a caller cannot forget a join and silently publish withheld content.
- **Postgres owns the clock.** The codebase reads the wall clock directly and has no injected clock, so the one-hour boundary and the activity window live in SQL. That is the only clock a test can aim at by choosing row timestamps.
- **The API decides indexability, not the web layer.** The rule is returned as a boolean so the Web Companion renders a robots directive from a value and owns no part of the rule. This keeps the decision inside an already-tested seam.
- **A count is not a URL.** Reading Activity counts withheld Saved Items; the item list never shows them. The grid would be too empty to be worth drawing otherwise.
- **Copy carries the safety burden.** Turning a profile on republishes an existing library at once, with no review screen. The one-hour delay and a one-action private marker are the backstops.

## Slice 1 — API and contract (done)

Seven tickets, one commit each on `feature/public-profiles`.

| Ticket | Delivered |
| --- | --- |
| [PLO-425](https://linear.app/plowski-inc/issue/PLO-425) | Shared client-address resolution, preferring `CF-Connecting-IP`. Fixed an existing defect: Connect exchange bucketed on the Cloudflare edge address, so all traffic shared one budget. |
| [PLO-426](https://linear.app/plowski-inc/issue/PLO-426) | The `profiles` record, and five session-only routes to claim, read, check, rename, and switch visibility. |
| [PLO-427](https://linear.app/plowski-inc/issue/PLO-427) | `is_private` on Saved Items and Folders, through a dedicated action, the capture payload, and the widened Folder update. |
| [PLO-428](https://linear.app/plowski-inc/issue/PLO-428) | The `public-profile` Capture Channel, end to end. |
| [PLO-429](https://linear.app/plowski-inc/issue/PLO-429) | The unauthenticated group, the shared not-found behaviour, and the per-IP budget. |
| [PLO-430](https://linear.app/plowski-inc/issue/PLO-430) | The paged public Saved Item list, on its own allow-list representation. |
| [PLO-431](https://linear.app/plowski-inc/issue/PLO-431) | Reading Activity as 52 weeks of daily counts. |

### Endpoints

| Route | Auth | Notes |
| --- | --- | --- |
| `GET /v1/profile` | App Session | The Account's own Handle and Profile Visibility. |
| `GET /v1/profile/handle-availability` | App Session | Checked before claiming. An Account's own Handle stays available to it. |
| `POST /v1/profile/handle` | App Session | Claims a Handle. 409 distinguishes "taken" from "this Account already has one". |
| `PATCH /v1/profile/handle` | App Session | Renames. Releases the old spelling at once. |
| `PUT /v1/profile/visibility` | App Session | Switching to private keeps the Handle reserved. |
| `GET /v1/public/profiles/{handle}` | none | Handle, join date, public item count, and the indexable boolean. |
| `GET /v1/public/profiles/{handle}/saved-items` | none | 50 per page, addressed by page number. |
| `GET /v1/public/profiles/{handle}/activity` | none | 52 weeks of daily counts. |

Account administration is deliberately session-only: the v1 REST API does not expose it through API Keys, so no scope was widened.

### Values decided during implementation

- **Public Profile Rate Limit: 60 requests per minute per IP** for the whole `/v1/public/` prefix. The API Key budget is 20, but one page view fans out across three endpoints.
- **Caching: `public, max-age=300` on success only.** A not-found is not cached, so publishing a profile is not hidden for another five minutes. Combined with the one-hour rule, a save becomes visible 60–65 minutes after capture.
- **Reserved Handles**: `api`, `docs`, `settings`, `inbox`, `library`, `connect`, `oauth`, `support`, `privacy`, `admin`, `u`, `user`, `sleevy`.
- **Page size 50**, ordered by Saved Item creation time with the identifier breaking ties, so a Duplicate Save cannot reorder a published page.

### Testing seams

Two existing seams, no new infrastructure — which is why the indexability rule lives in the API rather than the web layer.

- **HTTP handler seam** (`apps/api/test/server/http-app.test.ts`) for route behaviour, the not-found parity cases, the budget, and the OpenAPI description. Not-found parity is asserted by comparing whole response snapshots: status, sorted headers, and body.
- **Postgres seam** (`apps/api/test/integration/`) for the four-part rule, the one-hour boundary, UTC day bucketing, and case-insensitive Handle uniqueness.

Every rule in the public reads is pinned by a **failing mutation**: break one clause, confirm a named test goes red, restore it. This found a real gap — the Profile Visibility clause was redundant inside the Handle lookup, so no test pinned it and a later refactor could have removed it unnoticed.

Integration suites carry **no skip guard**. An unreachable database fails the suite. The pre-existing suite that swallowed its setup error was fixed in this slice after it masked a migration that could not apply.

### Known limitations, accepted

- **Not-found timing is not equalised.** The bodies are byte-identical and both paths run one identical statement, but the index-lookup difference between a private row and no row remains. Sub-millisecond, and not removable without a constant-time dummy read.
- **Without a proxy header every visitor shares one bucket.** The web `Request` carries no peer address, so a deployment with neither `CF-Connecting-IP` nor `X-Forwarded-For` puts all callers in one budget. Production always sits behind Cloudflare.
- **The activity window bounds only its start**, so a row with a future creation time would be counted while falling outside the reported window. Not reachable through normal capture.
- **An absent optional property crosses the wire as `null`** rather than being omitted. Pre-existing behaviour of the private representation, kept rather than diverged from.

## Slice 2 — the public page (not started)

The Web Companion renders `/u/{handle}`: the Handle alone as identity — no display name, no bio, no avatar, so Sleevy never republishes a Google profile image or makes every visitor request one.

- Real paged URLs, never infinite scroll, which a crawler cannot reach.
- `rel="ugc nofollow"` on every user-published outbound link, so Sleevy is not worth targeting for link spam.
- The robots directive renders from the API's `isIndexable` boolean. The web layer owns no part of the rule.
- A Save button attaches **after** the cached HTML lands, so the served markup never varies per viewer. It records the `public-profile` Capture Channel. Signed-out visitors get no button.

## Slice 3 — settings and discovery (not started)

- The opt-in flow in Settings, where the confirmation copy carries the safety burden: it must say that turning this on publishes the existing library.
- A one-action private marker on Web Companion rows, and a marker on rows that are private while the profile is public.
- A dynamic sitemap plus IndexNow, covering only profiles the API reports as indexable.

## Open follow-ups

- **Handle branding.** `Handle` travels as a bare `string` while sibling identifiers (`ProfileId`, `SavedItemId`, `FolderId`) are branded, so the rules live in loose functions a caller must remember to call.
- **Four Redis clients.** Each rate limiter opens its own connection for one behaviour. Pre-existing pattern, now with a fourth copy.
- **Handle rename cooldown and holding** were deliberately deferred. A renamed Handle is immediately claimable by anyone.
