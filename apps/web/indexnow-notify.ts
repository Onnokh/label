const key = process.env.INDEXNOW_KEY

if (!/^[A-Za-z0-9-]{8,128}$/.test(key ?? "")) {
  throw new Error("INDEXNOW_KEY must contain 8-128 letters, numbers, or hyphens.")
}

const origin = new URL(process.env.INDEXNOW_ORIGIN ?? "https://sleevy.app")

// The sitemap is the single source of truth for indexable pages: every SEO page
// is already listed there (it's how search engines discover them), so reading it
// keeps IndexNow in sync automatically as pages are added — no second list to
// maintain. Set INDEXNOW_URLS to a comma-separated list to override for one-off
// submissions.
//
// It is fetched from the running server rather than read off disk. The sitemap
// stopped being a static file when Public Profiles arrived: those come and go as
// Accounts publish, so the document is built per request. Asking the server is
// also the only way to submit those profile URLs, which are exactly the pages
// IndexNow exists to announce.
//
// This runs inside the web container, right after it reports healthy, so the
// server answering is the one just deployed.
const sitemapUrl = process.env.INDEXNOW_SITEMAP_URL ??
  `http://127.0.0.1:${process.env.PORT ?? 3000}/sitemap.xml`

async function urlsFromSitemap(): Promise<string[]> {
  const response = await fetch(sitemapUrl).catch((cause: unknown) => {
    throw new Error(`Could not reach the sitemap at ${sitemapUrl}: ${String(cause)}`)
  })

  if (!response.ok) {
    throw new Error(`Sitemap at ${sitemapUrl} answered ${response.status}.`)
  }

  const xml = await response.text()
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1])

  if (locs.length === 0) {
    throw new Error(`Sitemap at ${sitemapUrl} contained no <loc> entries.`)
  }

  // Re-resolve each path against INDEXNOW_ORIGIN so a non-default origin
  // (e.g. staging) submits its own URLs rather than the production hosts
  // baked into the sitemap.
  return locs.map((loc) => new URL(new URL(loc).pathname, origin).toString())
}

const configured = process.env.INDEXNOW_URLS?.split(",").map((url) => new URL(url.trim(), origin).toString())
const urlList = [...new Set(configured ?? (await urlsFromSitemap()))]

if (urlList.some((url) => new URL(url).host !== origin.host)) {
  throw new Error("Submission URLs may only point at INDEXNOW_ORIGIN.")
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: origin.host, key, urlList }),
})

if (!response.ok && response.status !== 202) {
  throw new Error(`IndexNow submission failed (${response.status}): ${await response.text()}`)
}

console.log(`IndexNow accepted ${urlList.length} URL(s) (${response.status}).`)
