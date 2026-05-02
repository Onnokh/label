import { Context, Effect, Layer, Option, Result } from "effect"

import { SavedItem } from "../../domain/SavedItem.js"
import {
  EnrichmentJob,
  EnrichmentStageResult,
} from "../../domain/EnrichmentJob.js"
import { AiEnricher } from "../ai/AiEnricher.js"
import { SavedItemIntake } from "../saved-items/SavedItemIntake.js"
import {
  ContentExtraction,
  ContentExtractor,
} from "../content/ContentExtractor.js"
import { PageFetcher } from "../fetch/PageFetcher.js"
import { Metadata, MetadataFetcher } from "../metadata/MetadataFetcher.js"
import { OEmbedFetcher } from "../metadata/OEmbedFetcher.js"

export type EnrichmentWorkflowResult = {
  readonly savedItem: SavedItem
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
      const contentExtractor = yield* ContentExtractor
      const aiEnricher = yield* AiEnricher
      const pageFetcher = yield* PageFetcher
      const intake = yield* SavedItemIntake

      return {
        enrich: (savedItemId: SavedItem["id"]) =>
          Effect.gen(function* () {
            yield* Effect.logInfo("enrichment started")
            let { savedItem, job } = yield* intake.startEnrichment(savedItemId)
            yield* Effect.logDebug("enrichment job created", {
              jobId: job.id,
              attempt: job.attempt,
              url: savedItem.originalUrl,
            })
            let metadata = Option.none<Metadata>()
            let content = Option.none<ContentExtraction>()
            const pageResult = yield* Effect.all(
              [pageFetcher.fetch(savedItem.originalUrl)],
              { mode: "result" },
            ).pipe(Effect.map(([result]) => result))

            const stages: Array<EnrichmentStageResult> = []

            {
              const oEmbedResult = yield* oEmbedFetcher.fetch(savedItem.originalUrl)

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
                savedItem = applyMetadata(savedItem, result.value)
              }
            }

            {
              const result = yield* runStage(
                "content",
                pageResultToOption(pageResult).pipe(
                  Effect.flatMap(
                    Option.match({
                      onNone: () =>
                        Effect.succeed<StageResult<ContentExtraction>>({
                          _tag: "skip",
                          message: "Fetched page was not HTML.",
                        }),
                      onSome: (page) =>
                        contentExtractor.extract(page).pipe(
                          Effect.map((contentOption) =>
                            Option.match(contentOption, {
                              onNone: (): StageResult<ContentExtraction> => ({
                                _tag: "skip",
                                message: "No readable article content extracted.",
                              }),
                              onSome: (value): StageResult<ContentExtraction> => ({
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
                content = Option.some(result.value)
                savedItem = applyContent(savedItem, result.value)
              }
            }

            const aiInput = {
              savedItem,
              metadata,
              content,
            }

            {
              const result = yield* runStage(
                "categorization",
                aiEnricher.classify(aiInput).pipe(
                  Effect.map((classificationOption) =>
                    Option.match(classificationOption, {
                      onNone: (): StageResult<readonly string[]> => ({
                        _tag: "skip",
                        message: "AI classification lacked enough signal.",
                      }),
                      onSome: (value): StageResult<readonly string[]> => ({
                        _tag: "success",
                        value: [value.generatedType, ...value.generatedTopics],
                      }),
                    }),
                  ),
                ),
                stages,
              )

              if (Option.isSome(result)) {
                const [generatedType, ...generatedTopics] = result.value
                savedItem = applyClassification(savedItem, generatedType, generatedTopics)
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
                savedItem = applyPreviewSummary(savedItem, result.value)
              }
            }

            savedItem = withUpdatedAt(savedItem)

            job = new EnrichmentJob({
              ...job,
              status: summarizeJobStatus(stages),
              stages,
              completedAt: new Date(),
            })

            yield* Effect.logInfo("enrichment finished", {
              jobStatus: job.status,
              enrichmentStatus: savedItem.enrichmentStatus,
              stages: stages.map((s) => `${s.stage}:${s.status}`),
            })

            return yield* intake.finishEnrichment(savedItem, job)
          }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(EnrichmentWorkflow, EnrichmentWorkflow.make)
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

const renderError = (error: unknown) => {
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
  savedItem: SavedItem,
  metadata: Metadata,
) =>
  new SavedItem({
    ...savedItem,
    title: metadata.title,
    description: metadata.description,
    siteName: metadata.siteName,
    faviconUrl: metadata.faviconUrl,
    faviconLightUrl: metadata.faviconLightUrl,
    faviconDarkUrl: metadata.faviconDarkUrl,
    imageUrl: metadata.imageUrl,
    canonicalUrl: metadata.canonicalUrl,
  })

const applyContent = (
  savedItem: SavedItem,
  _extraction: ContentExtraction,
) =>
  new SavedItem({
    ...savedItem,
  })

const applyClassification = (
  savedItem: SavedItem,
  generatedType: string | undefined,
  generatedTopics: readonly string[],
) =>
  new SavedItem({
    ...savedItem,
    generatedType: generatedType === "video" ||
      generatedType === "website" ||
      generatedType === "article" ||
      generatedType === "repository" ||
      generatedType === "unknown"
      ? generatedType
      : "unknown",
    generatedTopics,
  })

const applyPreviewSummary = (savedItem: SavedItem, previewSummary: string) =>
  new SavedItem({
    ...savedItem,
    previewSummary,
  })

const withUpdatedAt = (savedItem: SavedItem) =>
  new SavedItem({
    ...savedItem,
    enrichmentStatus: savedItem.generatedType ? "enriched" : "failed",
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
