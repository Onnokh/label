/**
 * Writes the machine-readable discovery documents the web origin publishes.
 *
 * The running API serves both of these itself, but building them from the
 * contract and the tool catalogue needs no database, no Redis, and no server,
 * so the checked-in copies under apps/web/public can be refreshed from a plain
 * `bun run` whenever either source changes.
 *
 * The Server Card is published as a file rather than a redirect to the API on
 * purpose: a scanner reading `/.well-known/mcp/server-card.json` should get the
 * card, not a 308 to another origin it may not follow.
 */
import { OpenApi } from "effect/unstable/httpapi"

import { sleevyApi } from "../src/api/ApiContract.js"
import { mcpServerCard } from "../src/modules/mcp/ServerCard.js"

// The published documents describe production, wherever they are generated.
const API_BASE_URL = "https://api.sleevy.app"
const WEB_URL = "https://sleevy.app"

const documents = [
  ["../../web/public/openapi.json", OpenApi.fromApi(sleevyApi)],
  [
    "../../web/public/.well-known/mcp/server-card.json",
    mcpServerCard({ apiBaseUrl: API_BASE_URL, webUrl: WEB_URL }),
  ],
] as const

for (const [path, document] of documents) {
  const target = new URL(path, import.meta.url)
  await Bun.write(target, JSON.stringify(document))
  console.log(`Wrote ${Bun.fileURLToPath(target)}`)
}
