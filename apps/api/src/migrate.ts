import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"

const url = process.env.DATABASE_URL

if (!url) {
  console.error("DATABASE_URL is required. Visible env keys:", Object.keys(process.env).sort())
  process.exit(1)
}

// Mask credentials for logging.
const safe = url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@")
console.log(`Migrating against ${safe}`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const connectWithRetry = async () => {
  const start = Date.now()
  // Wait up to ~30s for Postgres to accept connections.
  for (let attempt = 1; attempt <= 15; attempt++) {
    const client = new Client({ connectionString: url })
    try {
      await client.connect()
      console.log(`Connected on attempt ${attempt} (${Date.now() - start}ms)`)
      return client
    } catch (err) {
      console.warn(`Connect attempt ${attempt} failed: ${(err as Error).message}`)
      await client.end().catch(() => {})
      if (attempt === 15) throw err
      await sleep(2000)
    }
  }
  throw new Error("unreachable")
}

const client = await connectWithRetry()

try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
  console.log("Migrations applied")
} finally {
  await client.end()
}
