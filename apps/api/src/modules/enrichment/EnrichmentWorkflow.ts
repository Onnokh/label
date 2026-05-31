import { Context, Effect, Layer, Option, Result } from "effect"

import {
  Link,
  LinkEnrichment,
  LinkMetadata,
  type Topic,
} from "../../domain/SavedItem.js"
import {
  EnrichmentJob,
  EnrichmentStageResult,
} from "../../domain/EnrichmentJob.js"
import { AiEnricher } from "../ai/AiEnricher.js"
import { SavedItemIntake } from "../saved-items/SavedItemIntake.js"
import { PageFetcher } from "../fetch/PageFetcher.js"
import { Metadata, MetadataFetcher } from "../metadata/MetadataFetcher.js"
import { OEmbedFetcher } from "../metadata/OEmbedFetcher.js"

export type EnrichmentWorkflowResult = {
  readonly link: Link
  readonly metadata: LinkMetadata
  readonly enrichment: LinkEnrichment
  readonly job: EnrichmentJob
}

type StageResult<A> =
  | {
    readonly _tag: "success"
    readonly value: A
  }
  | {
    readonly _tag: "skip"
    readonly message: string
  }

export class EnrichmentWorkflow extends Context.Service<EnrichmentWorkflow>()(
  "@app/modules/enrichment/EnrichmentWorkflow",
  {
    make: Effect.gen(function* () {
      const metadataFetcher = yield* MetadataFetcher
      const oEmbedFetcher = yield* OEmbedFetcher
      const aiEnricher = yield* AiEnricher
      const pageFetcher = yield* PageFetcher
      const intake = yield* SavedItemIntake

      return {
        enrich: (linkId: Link["id"]) =>
          Effect.gen(function* () {
            const status = yield* intake.getEnrichmentStatus(linkId)
            if (status === "enriched") {
              return
            }

            const startResult = yield* intake.startEnrichment(linkId)
            const { link } = startResult
            let { metadata: linkMetadata, enrichment: linkEnrichment, job } = startResult
            yield* Effect.logDebug("enrichment job created", {
              jobId: job.id,
              attempt: job.attempt,
              url: link.originalUrl,
            })
            let metadata = Option.none<Metadata>()
            const pageResult = yield* Effect.all(
              [pageFetcher.fetch(link.originalUrl)],
              { mode: "result" },
            ).pipe(Effect.map(([result]) => result))

            const stages: Array<EnrichmentStageResult> = []

            {
              const oEmbedResult = yield* oEmbedFetcher.fetch(link.originalUrl)

              const result = yield* runStage(
                "metadata",
                Option.isSome(oEmbedResult)
                  ? Effect.succeed<StageResult<Metadata>>({
                    _tag: "success",
                    value: oEmbedResult.value,
                  })
                  : pageResultToOption(pageResult).pipe(
                    Effect.flatMap(
                      Option.match({
                        onNone: () =>
                          Effect.succeed<StageResult<Metadata>>({
                            _tag: "skip",
                            message: "Fetched page was not HTML.",
                          }),
                        onSome: (page) =>
                          metadataFetcher.parse(page).pipe(
                            Effect.map((metadataOption) =>
                              Option.match(metadataOption, {
                                onNone: (): StageResult<Metadata> => ({
                                  _tag: "skip",
                                  message: "No useful metadata found.",
                                }),
                                onSome: (value): StageResult<Metadata> => ({
                                  _tag: "success",
                                  value,
                                }),
                              }),
                            ),
                          ),
                      }),
                    ),
                  ),
                stages,
              )

              if (Option.isSome(result)) {
                metadata = Option.some(result.value)
                linkMetadata = applyMetadata(linkMetadata, result.value)
              }
            }

            const aiInput = {
              link,
              metadata,
            }

            {
              const result = yield* runStage<readonly Topic[]>(
                "tagging",
                aiEnricher.chooseTags(aiInput).pipe(
                  Effect.map((tagsOption) =>
                    Option.match(tagsOption, {
                      onNone: (): StageResult<readonly Topic[]> => ({
                        _tag: "skip",
                        message: "AI tags lacked enough signal or AI is disabled.",
                      }),
                      onSome: (value): StageResult<readonly Topic[]> => ({
                        _tag: "success",
                        value,
                      }),
                    }),
                  ),
                ),
                stages,
              )

              if (Option.isSome(result)) {
                linkEnrichment = applyTags(linkEnrichment, result.value)
              }
            }

            {
              const result = yield* runStage(
                "preview-summary",
                aiEnricher.preview(aiInput).pipe(
                  Effect.map((summaryOption) =>
                    Option.match(summaryOption, {
                      onNone: (): StageResult<string> => ({
                        _tag: "skip",
                        message: "AI preview summary is disabled or no input was available.",
                      }),
                      onSome: (value): StageResult<string> => ({
                        _tag: "success",
                        value,
                      }),
                    }),
                  ),
                ),
                stages,
              )

              if (Option.isSome(result)) {
                linkEnrichment = applyPreviewSummary(linkEnrichment, result.value)
              }
            }

            const jobStatus = summarizeJobStatus(stages)
            linkEnrichment = markFinished(
              linkEnrichment,
              jobStatus === "failed" ? "failed" : "enriched",
            )

            job = new EnrichmentJob({
              ...job,
              status: jobStatus,
              stages,
              completedAt: new Date(),
            })

            yield* Effect.logInfo("enrichment finished", {
              jobStatus: job.status,
              enrichmentStatus: linkEnrichment.status,
              stages: stages.map((s) => `${s.stage}:${s.status}`),
              title: linkMetadata.title,
              metadataSource: Option.isSome(metadata) ? "resolved" : "none",
            })

            return yield* intake.finishEnrichment(link, linkMetadata, linkEnrichment, job)
          }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(EnrichmentWorkflow, EnrichmentWorkflow.make)

  static readonly defaultLayer = EnrichmentWorkflow.layer.pipe(
    Layer.provide(MetadataFetcher.layer),
    Layer.provide(OEmbedFetcher.layer),
    Layer.provide(AiEnricher.defaultLayer),
    Layer.provide(PageFetcher.defaultLayer),
    Layer.provide(SavedItemIntake.defaultLayer),
  )
}

const pageResultToOption = <A>(
  result: Result.Result<Option.Option<A>, unknown>,
): Effect.Effect<Option.Option<A>, unknown> => {
  if (Result.isFailure(result)) {
    return Effect.fail(result.failure)
  }

  return Effect.succeed(result.success)
}

const runStage = <A>(
  stage: EnrichmentStageResult["stage"],
  effect: Effect.Effect<StageResult<A>, unknown>,
  stages: Array<EnrichmentStageResult>,
) =>
  Effect.gen(function* () {
    const startedAt = new Date()
    const result = yield* Effect.all([effect], { mode: "result" }).pipe(
      Effect.map(([value]) => value),
    )
    const completedAt = new Date()

    if (Result.isFailure(result)) {
      const message = renderError(result.failure)
      stages.push(
        new EnrichmentStageResult({
          stage,
          status: "failed",
          message,
          startedAt,
          completedAt,
        }),
      )
      yield* Effect.logWarning("enrichment stage failed", { stage, message })

      return Option.none<A>()
    }

    if (result.success._tag === "skip") {
      stages.push(
        new EnrichmentStageResult({
          stage,
          status: "skipped",
          message: result.success.message,
          startedAt,
          completedAt,
        }),
      )
      yield* Effect.logDebug("enrichment stage skipped", {
        stage,
        message: result.success.message,
      })

      return Option.none<A>()
    }

    stages.push(
      new EnrichmentStageResult({
        stage,
        status: "succeeded",
        startedAt,
        completedAt,
      }),
    )
    yield* Effect.logDebug("enrichment stage succeeded", {
      stage,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    })

    return Option.some(result.success.value)
  })

const renderError = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "cause" in error
  ) {
    const nested = renderError((error as { cause: unknown }).cause)
    if (nested) return nested
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }

  return String(error)
}

const applyMetadata = (
  linkMetadata: LinkMetadata,
  metadata: Metadata,
) =>
  new LinkMetadata({
    ...linkMetadata,
    title: metadata.title,
    description: metadata.description,
    siteName: metadata.siteName,
    faviconUrl: metadata.faviconUrl,
    faviconLightUrl: metadata.faviconLightUrl,
    faviconDarkUrl: metadata.faviconDarkUrl,
    imageUrl: metadata.imageUrl,
    canonicalUrl: metadata.canonicalUrl,
    fetchedAt: new Date(),
    updatedAt: new Date(),
  })

const applyTags = (
  enrichment: LinkEnrichment,
  tags: LinkEnrichment["tags"],
) =>
  new LinkEnrichment({
    ...enrichment,
    tags,
    updatedAt: new Date(),
  })

const applyPreviewSummary = (enrichment: LinkEnrichment, previewSummary: string) =>
  new LinkEnrichment({
    ...enrichment,
    previewSummary,
    updatedAt: new Date(),
  })

const markFinished = (
  enrichment: LinkEnrichment,
  status: LinkEnrichment["status"],
) =>
  new LinkEnrichment({
    ...enrichment,
    status,
    enrichedAt: status === "enriched" ? new Date() : undefined,
    updatedAt: new Date(),
  })

const summarizeJobStatus = (stages: ReadonlyArray<EnrichmentStageResult>) => {
  const failedCount = stages.filter((stage) => stage.status === "failed").length
  const succeededCount = stages.filter((stage) => stage.status === "succeeded").length

  if (failedCount === 0) {
    return "succeeded" as const
  }

  if (succeededCount > 0) {
    return "partial" as const
  }

  return "failed" as const
}
