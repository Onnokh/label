// The sitemap Sleevy serves at /sitemap.xml, which robots.txt names.
//
// It used to be a static file in public/, which cannot list Public Profiles:
// those come and go as Accounts turn Profile Visibility on and off, and the API
// decides which of them a search engine may be offered. So the document is built
// per request, and the twenty marketing and documentation URLs that were in the
// file are folded into it as data below rather than served from a second
// document.
//
// Folded into one document rather than split behind a sitemap index: twenty
// fixed URLs plus every indexable Public Profile stays far inside the 50,000
// URLs one sitemap file may hold, so an index would name two children that both
// fit in one file, and every crawler would fetch three documents instead of one.

export const SITE_ORIGIN = "https://sleevy.app"

// A sitemap file holds at most 50,000 URLs. The fixed entries take their share
// of that ceiling, and Public Profiles fill what is left.
const SITEMAP_URL_LIMIT = 50_000

export type SitemapUrl = {
  readonly loc: string
  // A W3C date. The fixed entries carry a day; a Public Profile carries the day
  // its newest published Saved Item was saved.
  readonly lastmod: string
  readonly changefreq?: string
  readonly priority?: string
}

// The URLs that do not depend on any Account. These were the contents of the
// former public/sitemap.xml, moved here unchanged so the document that replaces
// it cannot lose them, and so they are still served when the API is unreachable.
export const staticSitemapUrls: ReadonlyArray<SitemapUrl> = [
  { loc: `${SITE_ORIGIN}/`, lastmod: "2026-07-17", changefreq: "weekly", priority: "1.0" },
  { loc: `${SITE_ORIGIN}/docs`, lastmod: "2026-08-25", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/docs/overview`, lastmod: "2026-08-25" },
  { loc: `${SITE_ORIGIN}/docs/getting-started`, lastmod: "2026-07-18", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/docs/concepts`, lastmod: "2026-07-18" },
  { loc: `${SITE_ORIGIN}/docs/authentication`, lastmod: "2026-07-18" },
  { loc: `${SITE_ORIGIN}/docs/errors`, lastmod: "2026-07-18" },
  { loc: `${SITE_ORIGIN}/docs/rate-limits`, lastmod: "2026-07-18" },
  { loc: `${SITE_ORIGIN}/docs/api-reference`, lastmod: "2026-07-18" },
  { loc: `${SITE_ORIGIN}/docs/mcp`, lastmod: "2026-08-25", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/docs/guides`, lastmod: "2026-07-18", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/docs/reliability`, lastmod: "2026-08-25", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/docs/versioning`, lastmod: "2026-08-25", changefreq: "monthly", priority: "0.6" },
  { loc: `${SITE_ORIGIN}/privacy`, lastmod: "2026-07-16", changefreq: "yearly", priority: "0.5" },
  { loc: `${SITE_ORIGIN}/support`, lastmod: "2026-07-16", changefreq: "monthly", priority: "0.6" },
  { loc: `${SITE_ORIGIN}/raycast`, lastmod: "2026-07-16", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/chrome-extension`, lastmod: "2026-07-16", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/ios-app`, lastmod: "2026-07-16", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/web-companion`, lastmod: "2026-07-16", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/pocket-alternative`, lastmod: "2026-07-17", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/articles`, lastmod: "2026-07-17", changefreq: "weekly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/articles/save-links-with-raycast`, lastmod: "2026-07-17", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/articles/read-later-app-chrome-iphone`, lastmod: "2026-07-17", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/articles/bookmark-manager-for-developers`, lastmod: "2026-07-17", changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_ORIGIN}/articles/how-to-organize-too-many-open-tabs`, lastmod: "2026-08-11", changefreq: "monthly", priority: "0.8" },
]

// A Handle is 3 to 30 characters of a-z, 0-9, `-`, and `_`, so no Public Profile
// URL can carry a character XML has to escape. Escaping anyway costs nothing and
// keeps one malformed entry from breaking the whole document.
const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

// The day part of an ISO timestamp, which is the `lastmod` format sitemaps use
// for a page whose exact time of day tells a crawler nothing.
export const sitemapDay = (isoTimestamp: string) => isoTimestamp.slice(0, 10)

// The Public Profile of one Handle, as a sitemap entry. `lastmod` is when the
// page last changed, which the API reports as the creation time of the newest
// Saved Item the profile publishes.
export const profileSitemapUrl = (profile: {
  readonly handle: string
  readonly lastModifiedAt: string
}): SitemapUrl => ({
  loc: `${SITE_ORIGIN}/u/${profile.handle}`,
  lastmod: sitemapDay(profile.lastModifiedAt),
  // A Public Profile changes whenever its Account saves something.
  changefreq: "weekly",
  // Below every marketing page: these are pages Sleevy hosts, not pages Sleevy
  // wrote.
  priority: "0.5",
})

const renderUrl = (url: SitemapUrl) =>
  [
    "  <url>",
    `    <loc>${escapeXml(url.loc)}</loc>`,
    `    <lastmod>${escapeXml(url.lastmod)}</lastmod>`,
    ...(url.changefreq ? [`    <changefreq>${escapeXml(url.changefreq)}</changefreq>`] : []),
    ...(url.priority ? [`    <priority>${escapeXml(url.priority)}</priority>`] : []),
    "  </url>",
  ].join("\n")

export const renderSitemap = (urls: ReadonlyArray<SitemapUrl>) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.slice(0, SITEMAP_URL_LIMIT).map(renderUrl),
    "</urlset>",
    "",
  ].join("\n")
