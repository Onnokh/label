import { eq, type InferSelectModel } from "drizzle-orm"
import { Effect, Option } from "effect"

import { CapturedLink } from "../../domain/CapturedLink.js"
import { SqliteClient } from "../persistence/SqliteClient.js"
import { capturedLinksTable } from "../persistence/schema.js"

type CapturedLinkRecord = InferSelectModel<typeof capturedLinksTable>

export class CapturedLinkRepository extends Effect.Service<CapturedLinkRepository>()(
  "@app/modules/capture/CapturedLinkRepository",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* SqliteClient

      return {
        findByUrl: (url: string) =>
          Effect.sync(() => {
            const row = db.query.capturedLinksTable.findFirst({
              where: eq(capturedLinksTable.url, url),
            }).sync()

            return Option.map(
              Option.fromNullable(row),
              (record: CapturedLinkRecord) => new CapturedLink(record),
            )
          }),

        insert: (capturedLink: CapturedLink) =>
          Effect.sync(() => {
            db.insert(capturedLinksTable).values(capturedLink).run()

            return capturedLink
          }),
      }
    }),
  },
) { }

export const capturedLinkRepositoryLayer = CapturedLinkRepository.Default
