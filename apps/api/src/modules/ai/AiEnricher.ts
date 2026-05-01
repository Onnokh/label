import { Effect, Option, Schema } from "effect"

import type { SavedItem } from "../../domain/SavedItem.js"
import type { ContentExtraction } from "../content/ContentExtractor.js"
import type { Metadata } from "../metadata/MetadataFetcher.js"
import { AppConfig } from "../../runtime/Config.js"

export class AiEnricherError extends Schema.TaggedError<AiEnricherError>()(
  "AiEnricherError",
  {
    operation: Schema.String,
    cause: Schema.Defect,
  },
) { }

export type AiEnrichmentInput = {
  readonly savedItem: SavedItem
  readonly metadata: Option.Option<Metadata>
  readonly content: Option.Option<ContentExtraction>
}

export class AiEnricher extends Effect.Service<AiEnricher>()(
  "@app/modules/ai/AiEnricher",
  {
    effect: Effect.gen(function* () {
      const config = yield* AppConfig

      return {
        categorize: (input: AiEnrichmentInput) =>
          Effect.succeed(
            config.ai.enabled
              ? inferCategories(input)
              : Option.none<readonly string[]>(),
          ),

        summarize: (input: AiEnrichmentInput) =>
          Effect.succeed(
            config.ai.enabled ? inferSummary(input) : Option.none<string>(),
          ),
      }
    }),
  },
) { }

const categoryMatchers: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["development", ["typescript", "javascript", "react", "node", "coding", "code", "software"]],
  ["ai", ["artificial intelligence", "machine learning", "llm", "model", "prompt", "openai"]],
  ["design", ["design", "ui", "ux", "visual", "typography", "figma"]],
  ["product", ["product", "roadmap", "strategy", "startup", "management"]],
  ["business", ["business", "market", "company", "revenue", "sales"]],
  ["science", ["research", "study", "science", "paper"]],
  ["writing", ["essay", "writing", "blog", "article", "newsletter"]],
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

  return [input.savedItem.host, metadataText, contentText].join(" ").toLowerCase()
}

const inferCategories = (input: AiEnrichmentInput) => {
  const text = sourceText(input)
  const categories = categoryMatchers
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([category]) => category)
    .slice(0, 3)

  return categories.length > 0 ? Option.some(categories) : Option.none<readonly string[]>()
}

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

export const aiEnricherLayer = AiEnricher.Default
