# Opt-In Public Profiles Implementation Guide

This document turns [ADR 0016](../adr/0016-opt-in-public-profiles.md) into a delivery plan. All three slices are built. The spec is [PLO-424](https://linear.app/plowski-inc/issue/PLO-424).

## Principles

- **Publishing is per Folder and explicit.** A Saved Item is public when Profile Visibility is public and the item sits in a Published Folder. Turning the profile on publishes nothing by itself, and an item in no Folder is never public. The inverse — publish everything, mark exceptions — was rejected because it asks a person to audit an existing library to find what they would not want seen, and gets the default wrong in the direction that cannot be undone.
- **One place decides what is public.** The publish rule lives in a single SQL condition that every public read composes. A reader cannot restate part of it, and the Folder and Profile Visibility clauses are subqueries rather than joins, so a caller cannot forget a join and silently publish content.
- **Postgres owns the clock.** The codebase reads the wall clock directly and has no injected clock, so the activity window lives in SQL. That is the only clock a test can aim at by choosing row timestamps.
- **The API decides indexability, not the web layer.** The rule is returned as a boolean so the Web Companion renders a robots directive from a value and owns no part of the rule. This keeps the decision inside an already-tested seam.
- **A count is not a URL.** Reading Activity counts every save, including those outside a Published Folder; the item list shows only what is published. The grid would be too empty to be worth drawing otherwise.
- **Unpublishing is the undo.** Publishing a Folder is deliberate and takes effect at once, and so does unpublishing it, so no delay, review screen, or per-item marker is needed.

## Slice 1 — API and contract

Seven tickets, one commit each on `feature/public-profiles`.

| Ticket | Delivered |
| --- | --- |
| [PLO-425](https://linear.app/plowski-inc/issue/PLO-425) | Shared client-address resolution, preferring `CF-Connecting-IP`. Fixed an existing defect: Connect exchange bucketed on the Cloudflare edge address, so all traffic shared one budget. |
| [PLO-426](https://linear.app/plowski-inc/issue/PLO-426) | The `profiles` record, and five session-only routes to claim, read, check, rename, and switch visibility. |
| [PLO-427](https://linear.app/plowski-inc/issue/PLO-427) | `is_published` on Folders, through the widened Folder update. |
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
| `GET /v1/public/indexable-profiles` | none | Handles a search engine may be offered, walked by the sitemap. |

Account administration is deliberately session-only: the v1 REST API does not expose it through API Keys, so no scope was widened.

### Values decided during implementation

- **Public Profile Rate Limit: 60 requests per minute per IP** for the whole `/v1/public/` prefix. The API Key budget is 20, but one page view fans out across three endpoints.
- **Caching:** Public Profile HTML uses `public, max-age=0, s-maxage=300, must-revalidate` and the `public-profile:<handle>` `Cache-Tag`. Owner changes to Profile Visibility, Published Folders, or Saved Item folder membership request an on-demand purge by that tag; an unconfigured Cloudflare purger falls back to the five-minute edge TTL. A not-found page is not cached, so claiming a Handle takes effect at once.
- **Reserved Handles**: `api`, `docs`, `settings`, `inbox`, `library`, `connect`, `oauth`, `support`, `privacy`, `admin`, `u`, `user`, `sleevy`.
- **Page size 50**, ordered by Saved Item creation time with the identifier breaking ties, so a Duplicate Save cannot reorder a published page.

### Testing seams

Two existing seams, no new infrastructure — which is why the indexability rule lives in the API rather than the web layer.

- **HTTP handler seam** (`apps/api/test/server/http-app.test.ts`) for route behaviour, the not-found parity cases, the budget, and the OpenAPI description. Not-found parity is asserted by comparing whole response snapshots: status, sorted headers, and body.
- **Postgres seam** (`apps/api/test/integration/`) for the publish rule, UTC day bucketing, and case-insensitive Handle uniqueness.

Every rule in the public reads is pinned by a **failing mutation**: break one clause, confirm a named test goes red, restore it. This found a real gap — the Profile Visibility clause was redundant inside the Handle lookup, so no test pinned it and a later refactor could have removed it unnoticed.

Integration suites carry **no skip guard**. An unreachable database fails the suite. The pre-existing suite that swallowed its setup error was fixed in this slice after it masked a migration that could not apply.

### Known limitations, accepted

- **Not-found timing is not equalised.** The bodies are byte-identical and both paths run one identical statement, but the index-lookup difference between an unpublished row and no row remains. Sub-millisecond, and not removable without a constant-time dummy read.
- **Without a proxy header every visitor shares one bucket.** The web `Request` carries no peer address, so a deployment with neither `CF-Connecting-IP` nor `X-Forwarded-For` puts all callers in one budget. Production always sits behind Cloudflare.
- **The activity window bounds only its start**, so a row with a future creation time would be counted while falling outside the reported window. Not reachable through normal capture.
- **An absent optional property crosses the wire as `null`** rather than being omitted. Pre-existing behaviour of the Saved Item representation, kept rather than diverged from.

## Slice 2 — the public page

The Web Companion renders `/u/{handle}`: the Handle alone as identity — no display name, no bio, no avatar, so Sleevy never republishes a Google profile image or makes every visitor request one.

- Real paged URLs, never infinite scroll, which a crawler cannot reach.
- `rel="ugc nofollow"` on every user-published outbound link, so Sleevy is not worth targeting for link spam.
- The robots directive renders from the API's `isIndexable` boolean. The web layer owns no part of the rule.
- A Save button attaches **after** the cached HTML lands, so the served markup never varies per viewer. It records the `public-profile` Capture Channel. Signed-out visitors get no button.

## Slice 3 — settings and discovery

- The opt-in flow in Settings. The copy states that turning the profile on publishes nothing by itself, and that an Account chooses which Folders appear.
- A one-action publish toggle on Folder rows in the Web Companion, and a marker showing which Folders are published while the profile is public.
- A dynamic sitemap plus IndexNow, covering only profiles the API reports as indexable.

## Open follow-ups

- **Handle branding.** `Handle` travels as a bare `string` while sibling identifiers (`ProfileId`, `SavedItemId`, `FolderId`) are branded, so the rules live in loose functions a caller must remember to call.
- **Four Redis clients.** Each rate limiter opens its own connection for one behaviour. Pre-existing pattern, now with a fourth copy.
- **Handle rename cooldown and holding** were deliberately deferred. A renamed Handle is immediately claimable by anyone.
- **Publishing is all-or-nothing per Folder.** There is no way to publish a Folder while holding back one item inside it; moving the item out is the answer.
