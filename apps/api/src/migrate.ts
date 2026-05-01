import { SQL } from "bun"
import { drizzle } from "drizzle-orm/bun-sql"
import { migrate } from "drizzle-orm/bun-sql/migrator"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}

const safe = url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@")
console.log(`Migrating against ${safe}`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let lastErr: unknown
for (let attempt = 1; attempt <= 15; attempt++) {
  const sql = new SQL(url)
  try {
    await sql`select 1`
    await migrate(drizzle({ client: sql }), { migrationsFolder: "./drizzle" })
    await sql.end()
    console.log("Migrations applied")
    process.exit(0)
  } catch (err) {
    lastErr = err
    console.warn(`Attempt ${attempt} failed: ${(err as Error).message}`)
    await sql.end().catch(() => {})
    await sleep(2000)
  }
}

console.error("Migration failed after retries:", lastErr)
process.exit(1)
