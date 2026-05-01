import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is required")
  process.exit(1)
}

const client = new Client({ connectionString: url })
await client.connect()

try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
  console.log("Migrations applied")
} finally {
  await client.end()
}
