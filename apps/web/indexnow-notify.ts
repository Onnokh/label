const key = process.env.INDEXNOW_KEY

if (!/^[A-Za-z0-9-]{8,128}$/.test(key ?? "")) {
  throw new Error("INDEXNOW_KEY must contain 8-128 letters, numbers, or hyphens.")
}

const origin = new URL(process.env.INDEXNOW_ORIGIN ?? "https://sleevy.app")

// The sitemap is the single source of truth for indexable pages: every SEO page
// is already listed there (it's how search engines discover them), so reading it
// keeps IndexNow in sync automatically as pages are added — no second list to
// maintain. Set INDEXNOW_URLS to a comma-separated list to override for one-off
// submissions. Candidate roots cover the runtime image (dist/client) and local
// runs from the app directory (public); Vite copies public/ into dist/client.
async function urlsFromSitemap(): Promise<string[]> {
  const roots = [`${import.meta.dir}/dist/client/sitemap.xml`, `${import.meta.dir}/public/sitemap.xml`]

  for (const path of roots) {
    const file = Bun.file(path)

    if (await file.exists()) {
      const xml = await file.text()
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1])

      if (locs.length === 0) {
        throw new Error(`Sitemap at ${path} contained no <loc> entries.`)
      }

      // Re-resolve each path against INDEXNOW_ORIGIN so a non-default origin
      // (e.g. staging) submits its own URLs rather than the production hosts
      // baked into the sitemap.
      return locs.map((loc) => new URL(new URL(loc).pathname, origin).toString())
    }
  }

  throw new Error(`No sitemap found (looked in: ${roots.join(", ")}).`)
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
