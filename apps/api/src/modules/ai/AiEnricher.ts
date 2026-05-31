import { OpenAiStructuredOutput } from "effect/unstable/ai"
import { Context, Data, Effect, Layer, Option, Schema } from "effect"

import { topics } from "@sleevy/contract"
import type { Link, Topic } from "../../domain/SavedItem.js"
import type { Metadata } from "../metadata/MetadataFetcher.js"
import { AppConfig } from "../../runtime/Config.js"

export class AiEnricherError extends Data.TaggedError("AiEnricherError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

export type AiEnrichmentInput = {
  readonly link: Link
  readonly metadata: Option.Option<Metadata>
}

const tagsSchema = Schema.Struct({
  tags: Schema.NullOr(Schema.Array(Schema.Literals(topics))),
})

const summarySchema = Schema.Struct({
  summary: Schema.NullOr(Schema.String),
})

const tagSystemPrompt =
  "You categorize web links into relevant tags. " +
  "Pick all tags that apply, or null if none fit well.\n\n" +
  "Tag definitions:\n" +
  "- ai: artificial intelligence, machine learning, LLMs, agents, prompts, AI tools and platforms\n" +
  "- tools: developer tooling, CLIs, SDKs, libraries, package managers, build tools\n" +
  "- typescript: TypeScript, JavaScript, Node.js, Deno, Bun, React, frontend frameworks\n" +
  "- security: security, authentication, encryption, vulnerabilities, CVEs, OAuth\n" +
  "- design: visual design, UI/UX, typography, color, layout, Figma, graphic design\n" +
  "- backend: databases, servers, infrastructure, APIs, queues, DevOps, cloud\n" +
  "- front-end: CSS, browser APIs, HTML, web components, accessibility, responsive design"

const summarySystemPrompt =
  "Write a 1-2 sentence preview summary of the linked page. " +
  "Be concise and factual. Return null if there is not enough information."

export class AiEnricher extends Context.Service<AiEnricher>()(
  "@app/modules/ai/AiEnricher",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig

      if (!config.ai.enabled || !config.ai.apiKey) {
        return {
          chooseTags: (_input: AiEnrichmentInput) =>
            Effect.succeed(Option.none<readonly Topic[]>()),
          preview: (_input: AiEnrichmentInput) =>
            Effect.succeed(Option.none<string>()),
        }
      }

      const apiKey = config.ai.apiKey
      const model = config.ai.model ?? "gpt-5.4-nano"

      return {
        chooseTags: Effect.fn("AiEnricher.chooseTags")(function* (input: AiEnrichmentInput) {
          const value = yield* generateOpenAiObject({
            apiKey,
            model,
            objectName: "link_tags",
            schema: tagsSchema,
            system: tagSystemPrompt,
            prompt: buildPromptText(input),
            operation: "chooseTags",
          })
          const tags = value.tags
          return tags && tags.length > 0
            ? Option.some(tags as readonly Topic[])
            : Option.none<readonly Topic[]>()
        }),

        preview: Effect.fn("AiEnricher.preview")(function* (input: AiEnrichmentInput) {
          const value = yield* generateOpenAiObject({
            apiKey,
            model,
            objectName: "link_preview",
            schema: summarySchema,
            system: summarySystemPrompt,
            prompt: buildPromptText(input),
            operation: "preview",
          })
          return value.summary ? Option.some(value.summary) : Option.none<string>()
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(AiEnricher, AiEnricher.make)

  static readonly defaultLayer = AiEnricher.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}

const buildPromptText = (input: AiEnrichmentInput) => {
  const parts: string[] = [`URL: ${input.link.originalUrl}`, `Host: ${input.link.host}`]

  Option.match(input.metadata, {
    onNone: () => {},
    onSome: (metadata) => {
      if (metadata.title) parts.push(`Title: ${metadata.title}`)
      if (metadata.description) parts.push(`Description: ${metadata.description}`)
      if (metadata.siteName) parts.push(`Site: ${metadata.siteName}`)
    },
  })

  return parts.join("\n")
}

const generateOpenAiObject = <S extends Schema.Top>({
  apiKey,
  model,
  objectName,
  schema,
  system,
  prompt,
  operation,
}: {
  readonly apiKey: string
  readonly model: string
  readonly objectName: string
  readonly schema: S
  readonly system: string
  readonly prompt: string
  readonly operation: string
}): Effect.Effect<S["Type"], AiEnricherError> => {
  const structuredOutput = OpenAiStructuredOutput.toCodecOpenAI(schema)

  return Effect.tryPromise({
    try: async () => {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: globalThis.JSON.stringify({
          model,
          input: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          text: {
            format: {
              type: "json_schema",
              name: objectName,
              schema: structuredOutput.jsonSchema,
              strict: true,
            },
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenAI request failed with ${response.status}`)
      }

      const body = (await response.json()) as OpenAiResponse
      const outputText = extractOpenAiOutputText(body)

      if (!outputText) {
        throw new Error("OpenAI response did not include structured output text")
      }

      return globalThis.JSON.parse(outputText) as unknown
    },
    catch: (cause) => new AiEnricherError({ operation, cause }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(structuredOutput.codec)),
    Effect.mapError((cause) =>
      cause instanceof AiEnricherError
        ? cause
        : new AiEnricherError({ operation, cause }),
    ),
  ) as Effect.Effect<S["Type"], AiEnricherError>
}

type OpenAiResponse = {
  readonly output_text?: string
  readonly output?: readonly {
    readonly content?: readonly {
      readonly type?: string
      readonly text?: string
    }[]
  }[]
}

const extractOpenAiOutputText = (body: OpenAiResponse) =>
  body.output_text ??
  body.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && content.text)?.text
