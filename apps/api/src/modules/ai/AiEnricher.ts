import { Context, Data, Effect, Layer, Option } from "effect"

import type { SavedItem } from "../../domain/SavedItem.js"
import type { ContentExtraction } from "../content/ContentExtractor.js"
import type { Metadata } from "../metadata/MetadataFetcher.js"
import { AppConfig } from "../../runtime/Config.js"

export class AiEnricherError extends Data.TaggedError("AiEnricherError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

export type AiEnrichmentInput = {
  readonly savedItem: SavedItem
  readonly metadata: Option.Option<Metadata>
  readonly content: Option.Option<ContentExtraction>
}

export class AiEnricher extends Context.Service<AiEnricher>()(
  "@app/modules/ai/AiEnricher",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig

      return {
        classify: (input: AiEnrichmentInput) =>
          Effect.succeed(
            config.ai.enabled ? inferClassification(input) : inferHeuristicClassification(input),
          ),

        preview: (input: AiEnrichmentInput) =>
          Effect.succeed(
            config.ai.enabled ? inferSummary(input) : Option.none<string>(),
          ),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(AiEnricher, AiEnricher.make)
}

const topicMatchers: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["TypeScript", ["typescript", "javascript", "react", "node"]],
  ["ai", ["artificial intelligence", "machine learning", "llm", "model", "prompt", "openai"]],
  ["Design", ["design", "ui", "ux", "visual", "typography", "figma"]],
  ["Product", ["product", "roadmap", "strategy", "startup", "management"]],
  ["Business", ["business", "market", "company", "revenue", "sales"]],
  ["ML", ["machine learning", "neural", "training", "dataset"]],
  ["Library", ["library", "framework", "package", "sdk"]],
]

const summarizeText = (value: string) => {
  const sentences = value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  if (sentences.length === 0) {
    return undefined
  }

  return sentences.slice(0, 2).join(" ").slice(0, 360).trim()
}

const sourceText = (input: AiEnrichmentInput) => {
  const metadataText = Option.match(input.metadata, {
    onNone: () => "",
    onSome: (metadata) =>
      [metadata.title, metadata.description, metadata.siteName]
        .filter((value): value is string => Boolean(value))
        .join(" "),
  })

  const contentText = Option.match(input.content, {
    onNone: () => "",
    onSome: (content) => content.content,
  })

  return [input.savedItem.host, input.savedItem.originalUrl, metadataText, contentText].join(" ").toLowerCase()
}

const inferGeneratedType = (input: AiEnrichmentInput) => {
  const text = sourceText(input)

  if (/\b(youtube\.com|youtu\.be|vimeo\.com|video)\b/.test(text)) {
    return "video" as const
  }

  if (/\b(github\.com|gitlab\.com|repository|repo)\b/.test(text)) {
    return "repository" as const
  }

  if (/\b(article|essay|newsletter|blog|post)\b/.test(text)) {
    return "article" as const
  }

  return "website" as const
}

const inferClassification = (input: AiEnrichmentInput) => {
  const text = sourceText(input)
  const generatedTopics = topicMatchers
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([topic]) => topic)
    .slice(0, 3)

  return Option.some({
    generatedType: inferGeneratedType(input),
    generatedTopics,
  })
}

const inferHeuristicClassification = (input: AiEnrichmentInput) =>
  Option.some({
    generatedType: inferGeneratedType(input),
    generatedTopics: [] as readonly string[],
  })

const inferSummary = (input: AiEnrichmentInput) => {
  const extractedSummary = Option.match(input.content, {
    onNone: () => undefined,
    onSome: (content) => summarizeText(content.content),
  })

  if (extractedSummary) {
    return Option.some(extractedSummary)
  }

  const metadataSummary = Option.match(input.metadata, {
    onNone: () => undefined,
    onSome: (metadata) =>
      summarizeText(
        [metadata.title, metadata.description]
          .filter((value): value is string => Boolean(value))
          .join(". "),
      ),
  })

  return metadataSummary ? Option.some(metadataSummary) : Option.none<string>()
}
