/**
 * Writes the OpenAPI document the docs site publishes.
 *
 * The running API serves the same document at `/openapi.json`, but building it
 * from the contract needs no database, no Redis, and no server, so the checked-in
 * copy under apps/web/public can be refreshed from a plain `bun run` whenever
 * the contract changes.
 */
import { OpenApi } from "effect/unstable/httpapi"

import { sleevyApi } from "../src/api/ApiContract.js"

const target = new URL("../../web/public/openapi.json", import.meta.url)

await Bun.write(target, JSON.stringify(OpenApi.fromApi(sleevyApi)))

console.log(`Wrote ${Bun.fileURLToPath(target)}`)
