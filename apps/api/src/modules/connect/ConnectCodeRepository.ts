import { randomBytes } from "node:crypto"
import { and, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"

import type { UserId } from "../../domain/SavedItem.js"
import type { Scope } from "../auth/Scopes.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { connectCodesTable } from "../persistence/schema.js"
import type { ConnectClientId } from "./ConnectClients.js"

const CODE_BYTES = 32
const CODE_TTL_MS = 5 * 60 * 1000

const base64Url = (buffer: Buffer): string =>
  buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")

const generateCode = () => base64Url(randomBytes(CODE_BYTES))

export type ConnectCodeRecord = {
  readonly code: string
  readonly userId: UserId
  readonly client: ConnectClientId
  readonly scopes: ReadonlyArray<Scope>
  readonly label: string
  readonly deviceHint: string | null
  readonly codeChallenge: string
  readonly redirectUri: string
}

export type CreateConnectCodeInput = {
  readonly userId: UserId
  readonly client: ConnectClientId
  readonly scopes: ReadonlyArray<Scope>
  readonly label: string
  readonly deviceHint: string | null
  readonly codeChallenge: string
  readonly redirectUri: string
}

export class ConnectCodeRepository extends Context.Service<ConnectCodeRepository>()(
  "@app/modules/connect/ConnectCodeRepository",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      const create = (input: CreateConnectCodeInput) =>
        Effect.gen(function* () {
          const code = generateCode()
          const expiresAt = new Date(Date.now() + CODE_TTL_MS)
          yield* db.insert(connectCodesTable).values({
            code,
            userId: input.userId,
            client: input.client,
            scopes: input.scopes as string[],
            label: input.label,
            deviceHint: input.deviceHint,
            codeChallenge: input.codeChallenge,
            redirectUri: input.redirectUri,
            expiresAt,
          })
          return code
        })

      const consume = (code: string) =>
        Effect.gen(function* () {
          const now = new Date()
          const rows = yield* db
            .update(connectCodesTable)
            .set({ consumedAt: now })
            .where(
              and(
                eq(connectCodesTable.code, code),
                isNull(connectCodesTable.consumedAt),
                gt(connectCodesTable.expiresAt, now),
              ),
            )
            .returning()
          const row = rows[0]
          if (!row) return Option.none<ConnectCodeRecord>()
          return Option.some<ConnectCodeRecord>({
            code: row.code,
            userId: row.userId,
            client: row.client as ConnectClientId,
            scopes: row.scopes as ReadonlyArray<Scope>,
            label: row.label,
            deviceHint: row.deviceHint,
            codeChallenge: row.codeChallenge,
            redirectUri: row.redirectUri,
          })
        })

      const cleanupExpired = () =>
        Effect.gen(function* () {
          const now = new Date()
          yield* db
            .delete(connectCodesTable)
            .where(
              or(
                lt(connectCodesTable.expiresAt, now),
                isNotNull(connectCodesTable.consumedAt),
              ),
            )
        })

      return { create, consume, cleanupExpired } as const
    }),
  },
) {
  static readonly layer = Layer.effect(ConnectCodeRepository, ConnectCodeRepository.make)

  static readonly defaultLayer = ConnectCodeRepository.layer.pipe(
    Layer.provide(PostgresClient.defaultLayer),
  )
}
