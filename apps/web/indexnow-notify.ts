const key = process.env.INDEXNOW_KEY

if (!/^[A-Za-z0-9-]{8,128}$/.test(key ?? "")) {
  throw new Error("INDEXNOW_KEY must contain 8-128 letters, numbers, or hyphens.")
}

const origin = new URL(process.env.INDEXNOW_ORIGIN ?? "https://sleevy.app")
const urlList = (process.env.INDEXNOW_URLS?.split(",") ?? ["/", "/docs", "/privacy", "/support"])
  .map((url) => new URL(url.trim(), origin).toString())

if (urlList.some((url) => new URL(url).host !== origin.host)) {
  throw new Error("INDEXNOW_URLS may only contain URLs on INDEXNOW_ORIGIN.")
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
