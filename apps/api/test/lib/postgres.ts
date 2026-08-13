import { SQL } from "bun"
import { drizzle } from "drizzle-orm/bun-sql"
import { migrate } from "drizzle-orm/bun-sql/migrator"
import { Pool } from "pg"

const testUrlFromDatabaseUrl = () => {
  const rawUrl =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgres://sleevy:sleevy@localhost:5434/sleevy"
  const url = new URL(rawUrl)
  if (!process.env.TEST_DATABASE_URL) {
    url.pathname = "/sleevy_test"
  }
  return url.toString()
}

export const testDatabaseUrl = testUrlFromDatabaseUrl()

const maintenanceUrl = (rawUrl: string) => {
  const url = new URL(rawUrl)
  const database = url.pathname.replace(/^\//, "")
  url.pathname = "/postgres"
  return { database, url: url.toString() }
}

export const setupTestDatabase = async () => {
  const { database, url } = maintenanceUrl(testDatabaseUrl)
  const maintenancePool = new Pool({ connectionString: url })

  try {
    await maintenancePool.query("select 1")
    const exists = await maintenancePool.query(
      "select 1 from pg_database where datname = $1",
      [database],
    )

    if (exists.rowCount === 0) {
      await maintenancePool.query(`create database ${quoteIdentifier(database)}`)
    }
  } finally {
    await maintenancePool.end()
  }

  const sql = new SQL(testDatabaseUrl)
  try {
    await migrate(drizzle({ client: sql }), { migrationsFolder: "./drizzle" })
  } finally {
    await sql.end()
  }
}

export const cleanTestDatabase = async () => {
  const pool = new Pool({ connectionString: testDatabaseUrl })
  try {
    await pool.query(`
      truncate table
        "user",
        "links",
        "sources",
        "profiles",
        "enrichment_jobs",
        "link_metadata",
        "link_enrichment",
        "saved_items",
        "session",
        "account",
        "verification",
        "apikey"
      restart identity cascade
    `)
  } finally {
    await pool.end()
  }
}

export const withTestDatabaseUrl = async <A>(run: () => Promise<A>) => {
  const previous = process.env.DATABASE_URL
  process.env.DATABASE_URL = testDatabaseUrl
  try {
    return await run()
  } finally {
    if (previous === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = previous
    }
  }
}

const quoteIdentifier = (value: string) =>
  `"${value.replaceAll('"', '""')}"`
