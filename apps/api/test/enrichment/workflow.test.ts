import { describe, expect } from "bun:test"
import { Effect, Layer, Option } from "effect"

import {
  EnrichmentJob,
  type EnrichmentJobId,
} from "../../src/domain/EnrichmentJob.js"
import {
  Link,
  LinkEnrichment,
  LinkMetadata,
  type LinkId,
  type Topic,
} from "../../src/domain/SavedItem.js"
import {
  AiEnricher,
  AiEnricherError,
  type AiEnrichmentInput,
} from "../../src/modules/ai/AiEnricher.js"
import { EnrichmentWorkflow } from "../../src/modules/enrichment/EnrichmentWorkflow.js"
import { PageDocument } from "../../src/modules/fetch/PageDocument.js"
import { PageFetcher } from "../../src/modules/fetch/PageFetcher.js"
import { MetadataFetcher } from "../../src/modules/metadata/MetadataFetcher.js"
import { OEmbedFetcher } from "../../src/modules/metadata/OEmbedFetcher.js"
import { SavedItemIntake } from "../../src/modules/saved-items/SavedItemIntake.js"
import { it } from "../lib/effect.js"

const linkId = "link-1" as LinkId
const jobId = "job-1" as EnrichmentJobId
const now = new Date("2026-05-19T12:00:00.000Z")

type FinishedEnrichment = {
  readonly link: Link
  readonly metadata: LinkMetadata
  readonly enrichment: LinkEnrichment
  readonly job: EnrichmentJob
}

const makeLink = () =>
  new Link({
    id: linkId,
    originalUrl: "https://example.com/articles/effect-api",
    normalizedUrl: "https://example.com/articles/effect-api",
    host: "example.com",
    createdAt: now,
    updatedAt: now,
  })

const makeMetadata = () =>
  new LinkMetadata({
    linkId,
    fetchedAt: now,
    updatedAt: now,
  })

const makeEnrichment = () =>
  new LinkEnrichment({
    linkId,
    type: "article",
    tags: [],
    status: "pending",
    updatedAt: now,
  })

const makeJob = () =>
  new EnrichmentJob({
    id: jobId,
    linkId,
    attempt: 1,
    status: "running",
    stages: [],
    queuedAt: now,
    startedAt: now,
  })

const makePage = (url: string) =>
  new PageDocument({
    requestedUrl: url,
    finalUrl: url,
    contentType: "text/html",
    fetchedAt: now,
    html: [
      "<!doctype html>",
      "<title>Effect API Testing - Example</title>",
      '<meta name="description" content="A practical guide to testing an Effect API.">',
      '<meta property="og:site_name" content="Example Docs">',
      "<body><nav>Docs Pricing</nav>",
      "<article><p>Layers make an Effect API testable without mocks.</p></article>",
      "</body>",
    ].join(""),
  })

const workflowLayer = (input: {
  readonly status?: LinkEnrichment["status"] | undefined
  readonly aiTags?: readonly Topic[] | undefined
  readonly aiPreview?: string | undefined
  readonly aiFails?: boolean | undefined
  readonly onAiInput?: ((input: AiEnrichmentInput) => void) | undefined
  readonly onStart?: (() => void) | undefined
  readonly onFinish?: ((result: FinishedEnrichment) => void) | undefined
}) =>
  EnrichmentWorkflow.layer.pipe(
    Layer.provideMerge(MetadataFetcher.layer),
    Layer.provideMerge(
      Layer.succeed(
        SavedItemIntake,
        SavedItemIntake.of({
          getEnrichmentStatus: () =>
            Effect.succeed(input.status ?? "pending"),
          startEnrichment: () =>
            Effect.sync(() => {
              input.onStart?.()
              return {
                link: makeLink(),
                metadata: makeMetadata(),
                enrichment: makeEnrichment(),
                job: makeJob(),
              }
            }),
          finishEnrichment: (link, metadata, enrichment, job) =>
            Effect.sync(() => {
              const result = { link, metadata, enrichment, job }
              input.onFinish?.(result)
              return result
            }),
        }),
      ),
    ),
    Layer.provideMerge(
      Layer.succeed(
        PageFetcher,
        PageFetcher.of({
          fetch: (url) => Effect.succeed(Option.some(makePage(url))),
        }),
      ),
    ),
    Layer.provideMerge(
      Layer.succeed(
        OEmbedFetcher,
        OEmbedFetcher.of({
          fetch: () => Effect.succeed(Option.none()),
        }),
      ),
    ),
    Layer.provideMerge(
      Layer.succeed(
        AiEnricher,
        AiEnricher.of({
          enrich: (aiInput) =>
            Effect.suspend(() => {
              input.onAiInput?.(aiInput)
              return input.aiFails
                ? Effect.fail(
                  new AiEnricherError({ operation: "enrich", cause: "upstream is down" }),
                )
                : Effect.succeed({
                  tags: input.aiTags ? Option.some(input.aiTags) : Option.none(),
                  summary: input.aiPreview ? Option.some(input.aiPreview) : Option.none(),
                })
            }),
        }),
      ),
    ),
  )

describe("EnrichmentWorkflow", () => {
  it.effect("enriches an intake link and persists metadata, tags, and preview", () => {
      let finished: FinishedEnrichment | undefined

      return Effect.gen(function* () {
        const workflow = yield* EnrichmentWorkflow
        yield* workflow.enrich(linkId)

        expect(finished?.metadata.title).toBe("Effect API Testing")
        expect(finished?.metadata.description).toBe("A practical guide to testing an Effect API.")
        expect(finished?.metadata.siteName).toBe("Example Docs")
        expect(finished?.enrichment.status).toBe("enriched")
        expect(finished?.enrichment.tags).toEqual(["backend", "typescript"])
        expect(finished?.enrichment.previewSummary).toBe("A practical guide to testing an Effect API.")
        expect(finished?.job.status).toBe("succeeded")
        expect(finished?.job.stages.map((stage) => `${stage.stage}:${stage.status}`)).toEqual([
          "metadata:succeeded",
          "tagging:succeeded",
          "preview-summary:succeeded",
        ])
      }).pipe(
        Effect.provide(workflowLayer({
          aiTags: ["backend", "typescript"],
          aiPreview: "A practical guide to testing an Effect API.",
          onFinish: (result) => {
            finished = result
          },
        })),
      )
    },
  )

  it.effect("hands the extracted page content to one AI call", () => {
    const aiInputs: AiEnrichmentInput[] = []
    let finished: FinishedEnrichment | undefined

    return Effect.gen(function* () {
      const workflow = yield* EnrichmentWorkflow
      yield* workflow.enrich(linkId)

      // Tags and Preview Summary are two stages served by a single AI call.
      expect(aiInputs.length).toBe(1)
      expect(finished?.job.stages.map((stage) => `${stage.stage}:${stage.status}`)).toEqual([
        "metadata:succeeded",
        "tagging:succeeded",
        "preview-summary:succeeded",
      ])

      const content = aiInputs[0]?.content
      expect(content && Option.isSome(content)).toBe(true)
      if (!content || Option.isNone(content)) return

      expect(content.value).toContain("Layers make an Effect API testable without mocks.")
      expect(content.value).not.toContain("Pricing")
    }).pipe(
      Effect.provide(workflowLayer({
        aiTags: ["typescript"],
        aiPreview: "Layers replace mocks when testing an Effect API.",
        onAiInput: (value) => {
          aiInputs.push(value)
        },
        onFinish: (result) => {
          finished = result
        },
      })),
    )
  })

  it.effect("fails both AI stages when the single call fails", () => {
    let finished: FinishedEnrichment | undefined

    return Effect.gen(function* () {
      const workflow = yield* EnrichmentWorkflow
      yield* workflow.enrich(linkId)

      expect(finished?.metadata.title).toBe("Effect API Testing")
      expect(finished?.enrichment.previewSummary).toBeUndefined()
      expect(finished?.job.status).toBe("partial")
      expect(finished?.job.stages.map((stage) => `${stage.stage}:${stage.status}`)).toEqual([
        "metadata:succeeded",
        "tagging:failed",
        "preview-summary:failed",
      ])
    }).pipe(
      Effect.provide(workflowLayer({
        aiFails: true,
        onFinish: (result) => {
          finished = result
        },
      })),
    )
  })

  it.effect("skips links that are already enriched", () =>
    Effect.gen(function* () {
      const workflow = yield* EnrichmentWorkflow
      yield* workflow.enrich(linkId)
    }).pipe(
      Effect.provide(workflowLayer({
        status: "enriched",
        onStart: () => {
          throw new Error("already enriched links should not start a new job")
        },
      })),
    ),
  )

  it.effect("still enriches metadata when AI tags and preview are skipped", () => {
    let finished: FinishedEnrichment | undefined

    return Effect.gen(function* () {
      const workflow = yield* EnrichmentWorkflow
      yield* workflow.enrich(linkId)

      expect(finished?.metadata.title).toBe("Effect API Testing")
      expect(finished?.enrichment.status).toBe("enriched")
      expect(finished?.enrichment.tags).toEqual([])
      expect(finished?.enrichment.previewSummary).toBeUndefined()
      expect(finished?.job.status).toBe("succeeded")
      expect(finished?.job.stages.map((stage) => `${stage.stage}:${stage.status}`)).toEqual([
        "metadata:succeeded",
        "tagging:skipped",
        "preview-summary:skipped",
      ])
    }).pipe(
      Effect.provide(workflowLayer({
        onFinish: (result) => {
          finished = result
        },
      })),
    )
  })
})
