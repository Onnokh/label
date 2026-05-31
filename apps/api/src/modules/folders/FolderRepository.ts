import { and, asc, eq, ne, sql } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"

import { Folder, type FolderId, type UserId } from "../../domain/SavedItem.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { foldersTable } from "../persistence/schema.js"

const decodeFolder = Schema.decodeUnknownSync(Folder)

const toFolder = (record: typeof foldersTable.$inferSelect): Folder =>
  decodeFolder(record)

export class FolderRepository extends Context.Service<FolderRepository>()(
  "@app/modules/folders/FolderRepository",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      return {
        listByUser: Effect.fn("FolderRepository.listByUser")(function* (userId: UserId) {
          const rows = yield* db
            .select()
            .from(foldersTable)
            .where(eq(foldersTable.userId, userId))
            .orderBy(asc(sql`lower(${foldersTable.name})`), asc(foldersTable.id))
          return rows.map(toFolder)
        }),

        findByUserAndId: Effect.fn("FolderRepository.findByUserAndId")(function* (userId: UserId, id: FolderId) {
          const [row] = yield* db
            .select()
            .from(foldersTable)
            .where(and(eq(foldersTable.userId, userId), eq(foldersTable.id, id)))
            .limit(1)
          return row ? Option.some(toFolder(row)) : Option.none<Folder>()
        }),

        findByNormalizedName: Effect.fn("FolderRepository.findByNormalizedName")(function* (userId: UserId, name: string, exceptId?: FolderId) {
          const [row] = yield* db
            .select()
            .from(foldersTable)
            .where(and(
              eq(foldersTable.userId, userId),
              sql`lower(${foldersTable.name}) = lower(${name})`,
              ...(exceptId ? [ne(foldersTable.id, exceptId)] : []),
            ))
            .limit(1)
          return row ? Option.some(toFolder(row)) : Option.none<Folder>()
        }),

        create: Effect.fn("FolderRepository.create")(function* (userId: UserId, name: string, emoji: string | null, color: string | null) {
          const [row] = yield* db
            .insert(foldersTable)
            .values({ userId, name, emoji, color })
            .onConflictDoNothing()
            .returning()
          return row ? Option.some(toFolder(row)) : Option.none<Folder>()
        }),

        rename: Effect.fn("FolderRepository.rename")(function* (userId: UserId, id: FolderId, name: string, emoji?: string | null, color?: string | null) {
          const [row] = yield* db
            .update(foldersTable)
            .set({
              name,
              ...(emoji !== undefined ? { emoji } : {}),
              ...(color !== undefined ? { color } : {}),
              updatedAt: new Date(),
            })
            .where(and(eq(foldersTable.userId, userId), eq(foldersTable.id, id)))
            .returning()
          return row ? Option.some(toFolder(row)) : Option.none<Folder>()
        }),

        deleteByUserAndId: Effect.fn("FolderRepository.deleteByUserAndId")(function* (userId: UserId, id: FolderId) {
          const rows = yield* db
            .delete(foldersTable)
            .where(and(eq(foldersTable.userId, userId), eq(foldersTable.id, id)))
            .returning()
          return rows.length > 0
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(FolderRepository, FolderRepository.make)

  static readonly defaultLayer = FolderRepository.layer.pipe(
    Layer.provide(PostgresClient.defaultLayer),
  )
}
