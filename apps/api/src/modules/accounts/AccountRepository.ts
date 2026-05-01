import { createHash, randomBytes } from "node:crypto"

import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"

import { Account, CaptureToken } from "../../domain/Account.js"
import type { AccountId } from "../../domain/SavedItem.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { accountsTable, captureTokensTable } from "../persistence/schema.js"

export const hashCaptureToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex")

export const createRawCaptureToken = () => `label_cap_${randomBytes(32).toString("base64url")}`

const toAccount = (record: typeof accountsTable.$inferSelect) =>
  new Account({
    id: record.id,
    googleSubject: record.googleSubject,
    email: record.email,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })

const toCaptureToken = (record: typeof captureTokensTable.$inferSelect) =>
  new CaptureToken({
    id: record.id,
    accountId: record.accountId,
    tokenHash: record.tokenHash,
    createdAt: record.createdAt,
    regeneratedAt: record.regeneratedAt ?? undefined,
  })

export class AccountRepository extends Context.Service<AccountRepository>()(
  "@app/modules/accounts/AccountRepository",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      return {
        upsertGoogleAccount: (input: { readonly googleSubject: string; readonly email: string }) =>
          Effect.gen(function* () {
            const [row] = yield* db
              .insert(accountsTable)
              .values({
                googleSubject: input.googleSubject,
                email: input.email.toLowerCase(),
              })
              .onConflictDoUpdate({
                target: accountsTable.googleSubject,
                set: {
                  email: input.email.toLowerCase(),
                  updatedAt: new Date(),
                },
              })
              .returning()

            if (!row) {
              throw new Error("Account upsert did not return a row.")
            }

            return toAccount(row)
          }),

        findById: (id: AccountId) =>
          Effect.gen(function* () {
            const rows = yield* db
              .select()
              .from(accountsTable)
              .where(eq(accountsTable.id, id))
              .limit(1)
            const row = rows[0]

            return row ? Option.some(toAccount(row)) : Option.none<Account>()
          }),

        findByCaptureToken: (rawToken: string) =>
          Effect.gen(function* () {
            const rows = yield* db
              .select()
              .from(captureTokensTable)
              .where(eq(captureTokensTable.tokenHash, hashCaptureToken(rawToken)))
              .limit(1)
            const row = rows[0]

            return row ? Option.some(toCaptureToken(row)) : Option.none<CaptureToken>()
          }),

        regenerateCaptureToken: (accountId: AccountId) =>
          Effect.gen(function* () {
            const rawToken = createRawCaptureToken()
            const tokenHash = hashCaptureToken(rawToken)
            const now = new Date()
            const [row] = yield* db
              .insert(captureTokensTable)
              .values({ accountId, tokenHash, regeneratedAt: now })
              .onConflictDoUpdate({
                target: captureTokensTable.accountId,
                set: { tokenHash, regeneratedAt: now },
              })
              .returning()

            if (!row) {
              throw new Error("Capture token regeneration did not return a row.")
            }

            return { captureToken: toCaptureToken(row), rawToken }
          }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(AccountRepository, AccountRepository.make)
}
