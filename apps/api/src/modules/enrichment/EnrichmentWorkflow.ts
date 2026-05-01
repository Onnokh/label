import { Effect, Either, Option } from "effect"

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

export class EnrichmentWorkflow extends Effect.Service<EnrichmentWorkflow>()(
  "@app/modules/enrichment/EnrichmentWorkflow",
  {
    effect: Effect.gen(function* () {
      const metadataFetcher = yield* MetadataFetcher
      const contentExtractor = yield* ContentExtractor
      const aiEnricher = yield* AiEnricher
      const pageFetcher = yield* PageFetcher
      const intake = yield* SavedItemIntake

      return {
        enrich: (savedItemId: SavedItem["id"]) =>
          Effect.gen(function* () {
            let { savedItem, job } = yield* intake.startEnrichment(savedItemId)
            let metadata = Option.none<Metadata>()
            let content = Option.none<ContentExtraction>()
            const pageResult = yield* pageFetcher.fetch(savedItem.url).pipe(Effect.either)

            const stages: Array<EnrichmentStageResult> = []

            {
              const result = yield* runStage(
                "metadata",
                pageResultToOption(pageResult).pipe(
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
                aiEnricher.categorize(aiInput).pipe(
                  Effect.map((categoriesOption) =>
                    Option.match(categoriesOption, {
                      onNone: (): StageResult<readonly string[]> => ({
                        _tag: "skip",
                        message: "AI categorization is disabled or lacked enough signal.",
                      }),
                      onSome: (value): StageResult<readonly string[]> => ({
                        _tag: "success",
                        value,
                      }),
                    }),
                  ),
                ),
                stages,
              )

              if (Option.isSome(result)) {
                savedItem = applyCategories(savedItem, result.value)
              }
            }

            {
              const result = yield* runStage(
                "summary",
                aiEnricher.summarize(aiInput).pipe(
                  Effect.map((summaryOption) =>
                    Option.match(summaryOption, {
                      onNone: (): StageResult<string> => ({
                        _tag: "skip",
                        message: "AI summary is disabled or no summary input was available.",
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
                savedItem = applySummary(savedItem, result.value)
              }
            }

            savedItem = withUpdatedAt(savedItem)

            job = new EnrichmentJob({
              ...job,
              status: summarizeJobStatus(stages),
              stages,
              completedAt: new Date(),
            })

            return yield* intake.finishEnrichment(savedItem, job)
          }),
      }
    }),
  },
) { }

const pageResultToOption = <A>(
  result: Either.Either<Option.Option<A>, unknown>,
): Effect.Effect<Option.Option<A>, unknown> => {
  if (Either.isLeft(result)) {
    return Effect.fail(result.left)
  }

  return Effect.succeed(result.right)
}

const runStage = <A>(
  stage: EnrichmentStageResult["stage"],
  effect: Effect.Effect<StageResult<A>, unknown>,
  stages: Array<EnrichmentStageResult>,
) =>
  Effect.gen(function* () {
    const startedAt = new Date()
    const result = yield* effect.pipe(Effect.either)
    const completedAt = new Date()

    if (Either.isLeft(result)) {
      stages.push(
        new EnrichmentStageResult({
          stage,
          status: "failed",
          message: renderError(result.left),
          startedAt,
          completedAt,
        }),
      )

      return Option.none<A>()
    }

    if (result.right._tag === "skip") {
      stages.push(
        new EnrichmentStageResult({
          stage,
          status: "skipped",
          message: result.right.message,
          startedAt,
          completedAt,
        }),
      )

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

    return Option.some(result.right.value)
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
    imageUrl: metadata.imageUrl,
    canonicalUrl: metadata.canonicalUrl,
  })

const applyContent = (
  savedItem: SavedItem,
  extraction: ContentExtraction,
) =>
  new SavedItem({
    ...savedItem,
    extractedContent: extraction.content,
    excerpt: extraction.excerpt,
    wordCount: extraction.wordCount,
    extractedAt: extraction.extractedAt,
  })

const applyCategories = (savedItem: SavedItem, categories: readonly string[]) =>
  new SavedItem({
    ...savedItem,
    categories,
  })

const applySummary = (savedItem: SavedItem, summary: string) =>
  new SavedItem({
    ...savedItem,
    summary,
  })

const withUpdatedAt = (savedItem: SavedItem) =>
  new SavedItem({
    ...savedItem,
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

export const enrichmentWorkflowLayer = EnrichmentWorkflow.Default
