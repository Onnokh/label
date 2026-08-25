import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { CaptureService } from "../modules/capture/CaptureService.js"
import { Analytics } from "../modules/analytics/Analytics.js"
import type { CaptureChannel, FolderId } from "../domain/SavedItem.js"
import { EnrichmentWorkflow } from "../modules/enrichment/EnrichmentWorkflow.js"
import type { Topic } from "@sleevy/contract"
import {
  BatchCaptureResponse,
  BatchCaptureResult,
  CaptureCreated,
  CaptureUpdated,
  CurrentUser,
  FolderNotFoundError,
  InvalidUrlError,
  savedItemToDto,
  sleevyApi,
} from "./ApiContract.js"
import { gated } from "./AuthMiddleware.js"

/**
 * Saves one URL and does everything that follows from it: the analytics event,
 * and the background enrichment of a Link that has not been enriched yet.
 *
 * Both the single-capture endpoint and each entry of a batch go through here,
 * so a URL saved in a batch is saved exactly the way a URL saved on its own is.
 */
const saveOne = (payload: {
  readonly url: string
  readonly sourceName?: string | undefined
  readonly captureChannel?: CaptureChannel | undefined
  readonly tags?: ReadonlyArray<Topic> | undefined
  readonly folderId?: string | null | undefined
}) =>
  Effect.gen(function* () {
    const capture = yield* CaptureService
    const enrichment = yield* EnrichmentWorkflow
    const analytics = yield* Analytics
    const userId = yield* CurrentUser
    const result = yield* capture.save({
      userId,
      url: payload.url,
      ...(payload.sourceName !== undefined ? { sourceName: payload.sourceName } : {}),
      ...(payload.captureChannel !== undefined ? { captureChannel: payload.captureChannel } : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
      folderId: payload.folderId === null || payload.folderId === undefined
        ? null
        : payload.folderId as FolderId,
    }).pipe(
      Effect.catchTags({
        InvalidUrl: (error) =>
          Effect.fail(new InvalidUrlError({
            message: "Capture URL must be a valid HTTP or HTTPS URL.",
            url: error.url,
          })),
        FolderReferenceNotFound: (error) =>
          Effect.fail(new FolderNotFoundError({
            message: "Folder was not found.",
            folderId: error.folderId,
          })),
        EffectDrizzleQueryError: Effect.die,
        SqlError: Effect.die,
      }),
    )
    yield* Effect.logInfo(
      result.captureResult === "created" ? "Added bookmark" : "Updated bookmark",
      { host: result.savedItem.link.host },
    )
    yield* analytics
      .track({
        name: "capture",
        userId,
        properties: {
          channel: result.savedItem.savedItem.captureChannel ?? "unknown",
          result: result.captureResult,
          type: result.savedItem.enrichment.type,
          has_folder: result.savedItem.savedItem.folderId != null,
          tag_count: result.savedItem.savedItem.tags.length,
        },
      })
      .pipe(Effect.forkDetach)
    if (result.enrichment._tag === "start") {
      yield* enrichment
        .enrich(result.enrichment.linkId)
        .pipe(
          Effect.annotateLogs({
            savedItemId: result.savedItem.savedItem.id,
            linkId: result.enrichment.linkId,
          }),
          Effect.ignore({ log: true }),
          Effect.forkDetach,
        )
    }
    return {
      captureResult: result.captureResult,
      savedItem: savedItemToDto(result.savedItem),
    } as const
  })

export const capturesGroupLive = HttpApiBuilder.group(sleevyApi, "captures", (handlers) =>
  handlers
    .handle("capture", gated("saved-items:capture", ({ payload }) =>
      Effect.map(saveOne(payload), ({ captureResult, savedItem }) =>
        captureResult === "created"
          ? new CaptureCreated({ savedItem, captureResult: "created" })
          : new CaptureUpdated({ savedItem, captureResult: "updated" })),
    ))
    // A batch is a loop, not a transaction: one bad URL must not cost the
    // caller the rest of the batch, so each entry's failure is caught and
    // reported in its own result. Entries run in order rather than in parallel,
    // so a batch costs the enrichment backend no more than the same URLs sent
    // one at a time would.
    .handle("captureBatch", gated("saved-items:capture", ({ payload }) =>
      Effect.gen(function* () {
        const results: BatchCaptureResult[] = []

        for (const [index, entry] of payload.captures.entries()) {
          const outcome = yield* saveOne(entry).pipe(
            Effect.map((saved) =>
              new BatchCaptureResult({
                index,
                url: entry.url,
                outcome: saved.captureResult === "created" ? "created" : "updated",
                savedItem: saved.savedItem,
              })),
            Effect.catchTags({
              InvalidUrlError: (error) =>
                Effect.succeed(new BatchCaptureResult({
                  index,
                  url: entry.url,
                  outcome: "failed",
                  savedItem: null,
                  code: "invalid_url",
                  message: error.message,
                })),
              FolderNotFoundError: (error) =>
                Effect.succeed(new BatchCaptureResult({
                  index,
                  url: entry.url,
                  outcome: "failed",
                  savedItem: null,
                  code: "folder_not_found",
                  message: error.message,
                })),
            }),
          )
          results.push(outcome)
        }

        const count = (outcome: BatchCaptureResult["outcome"]) =>
          results.filter((result) => result.outcome === outcome).length

        return new BatchCaptureResponse({
          results,
          created: count("created"),
          updated: count("updated"),
          failed: count("failed"),
        })
      }),
    )),
)
