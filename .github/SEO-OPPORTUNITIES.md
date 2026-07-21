# SEO Opportunity Scan — 2026-07-21

**Action**: Six P0/P1 pages published 2026-07-16 need indexing monitoring and visibility baselines; `/` homepage showing steep decline (−92% impressions); `/docs` gaining first impressions but needs nurturing; two P0/P1 pages not yet indexed (ios-app, raycast).

## Data Window

| Period | Start | End |
|---|---|---|
| Current | 2026-06-17 | 2026-07-14 |
| Previous | 2026-05-20 | 2026-06-16 |
| Data coverage | 63 days (2026-05-17 → 2026-07-18) |

## Opportunity Signals

No striking-distance, CTR, new-demand, or cannibalization signals detected in this window. All opportunity categories are empty.

## Page Verdicts

### Needs Attention

| Page | Verdict | Reasons | Key Metrics (Current → Previous) |
|---|---|---|---|
| `/` | **declining** | Impressions down 92% versus previous window | TrueTotals: 22 imp, 1 click, 4.5 pos → 74 imp, 2 clicks, 6.1 pos |
| `/docs` | **new-visibility** | First impressions appeared (2) in current window | AllQueries: 2 imp, 0 clicks, pos 45 → 0 all zeros |
| `http://sleevy.app/` (unmapped) | **declining** | Impressions down 100% | 0 imp → 2 imp — low base but fully lost |
| `/ios-app` | **awaiting-launch** | Published 2026-07-16, **not indexed** | P0 priority — no data yet |
| `/raycast` | **awaiting-launch** | Published 2026-07-16, **not indexed** | P1 priority — no data yet |

### Awaiting Launch (Published 2026-07-16/17, too early for data)

| Page | Priority | Indexed | Intent |
|---|---|---|---|
| `/chrome-extension` | P0 | indexed | product-solution |
| `/ios-app` | P0 | **not-indexed** | product-how-to |
| `/pocket-alternative` | P0 | indexed | comparison |
| `/articles/read-later-app-chrome-iphone` | P1 | indexed | product-comparison |
| `/raycast` | P1 | **not-indexed** | navigational-product |
| `/web-companion` | P1 | indexed | product-solution |
| `/articles/bookmark-manager-for-developers` | P2 | indexed | exploratory |

### Inventory / No Visibility (no action needed)

| Page | Verdict | Notes |
|---|---|---|
| `/articles` | no-visibility | Inventory page |
| `/articles/save-links-with-raycast` | no-visibility | Supporting content, no keyword target |
| `/privacy` | no-visibility | Inventory page |
| `/support` | no-visibility | Inventory page, **not indexed** |

## Registry Context

| Metric | Count |
|---|---|
| Targets | 13 |
| Keywords | 31 |
| Clusters | 8 |
| Sitemap pages | 20 |
| Unmapped pages | 7 (`/docs/getting-started`, `/docs/concepts`, `/docs/authentication`, `/docs/errors`, `/docs/rate-limits`, `/docs/api-reference`, `/docs/guides`) |
| Actions this run | 9 |

### Key registry targets

- **P0**: `/chrome-extension` (product-solution, Chrome capture cluster), `/ios-app` (product-how-to, iPhone capture cluster), `/pocket-alternative` (comparison, Pocket alternative cluster)
- **P1**: `/docs` (developer-solution, API cluster — already showing first impressions), `/raycast` (navigational-product, Raycast cluster — **not indexed**), `/web-companion` (product-solution, Web companion cluster), `/articles/read-later-app-chrome-iphone` (product-comparison, Cross-device cluster)
- **P2**: `/articles/bookmark-manager-for-developers` (exploratory, Developer workflow cluster)

## Recommended Actions

1. **Investigate `/` decline** — homepage impressions crashed from 74 to 22. May be seasonal or a technical issue (e.g., Google re-evaluation).
2. **Request indexing for `/ios-app` and `/raycast`** — both are P0/P1 and not indexed via Google Search Console URL inspection.
3. **Monitor `/docs`** — first 2 impressions at position 45 indicate early traction. The 7 unmapped doc sub-pages should be added to the sitemap.
4. **Track the 7 recently-published pages** — next window will have enough data for baselines on all pages published 2026-07-16/17.
5. **Redirect or canonicalize `http://sleevy.app/`** — the http variant still gets impressions but is unmapped and declining.
