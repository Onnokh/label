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
  /** Extracted Page Content, when the fetched document yielded any. */
  readonly content: Option.Option<string>
}

export type AiEnrichmentResult = {
  readonly tags: Option.Option<readonly Topic[]>
  readonly summary: Option.Option<string>
}

/** Tags and Preview Summary come back together, so the page is sent once. */
const enrichmentSchema = Schema.Struct({
  tags: Schema.NullOr(Schema.Array(Schema.Literals(topics))),
  summary: Schema.NullOr(Schema.String),
})

/**
 * One prompt for both AI Enrichment outputs, so the Extracted Page Content is
 * paid for once per link.
 *
 * The Preview Summary rules carry most of the weight: it sits under the title
 * in a Saved Item row, and without them the model narrates the page as an
 * object ("This page documents...") and repeats the title.
 */
export const enrichmentSystemPrompt = [
  "You prepare the AI Enrichment of a link saved to a read-later app: its tags, and the preview line shown under the title.",
  "",
  "You get the URL, whatever metadata the page published, and the page text where it could be read. The text is a rough extract, so stray labels and truncation at the end are normal. Work from the text first and from the metadata only when there is no text.",
  "",
  "Tags. Pick every tag that applies, or null when none fit well:",
  "- ai: artificial intelligence, machine learning, LLMs, agents, prompts, AI tools and platforms",
  "- tools: developer tooling, CLIs, SDKs, libraries, package managers, build tools",
  "- typescript: TypeScript, JavaScript, Node.js, Deno, Bun, React, frontend frameworks",
  "- security: security, authentication, encryption, vulnerabilities, CVEs, OAuth",
  "- design: visual design, UI/UX, typography, color, layout, Figma, graphic design",
  "- backend: databases, servers, infrastructure, APIs, queues, DevOps, cloud",
  "- front-end: CSS, browser APIs, HTML, web components, accessibility, responsive design",
  "",
  "Summary. The reader uses it to decide whether to open the link, so it must say what the page tells them, not what the page is:",
  "- Write one or two plain sentences, 200 characters or fewer in total.",
  "- Start with the subject matter. Never open with \"This page\", \"The page\", \"The article\", \"The post\", \"This repository\", \"The site\", \"The author\", or the publication name.",
  "- Give the substance: the main point, finding, or number for an article; what it does and who it is for, for a tool, library, or product; what the project is, for a repository; what it covers, for a blog or feed index.",
  "- Add what the title leaves out. Never restate the title in other words.",
  "- Do not talk about the page as an object. Avoid \"documents\", \"discusses\", \"explains the concept of\", \"provides an overview\", \"positions itself as\", \"highlights\", \"is designed to\".",
  "- Do not attribute or hedge. Avoid \"claims\", \"reportedly\", \"according to\", \"appears to be\", \"seems to\".",
  "- Do not mention metadata, missing information, navigation, sign-up prompts, cookie notices, or paywalls.",
  "- Leave out marketing language. Write in neutral present tense.",
  "- Plain text only. No markdown and no surrounding quotes.",
  "- Return null when the content is a login wall, consent screen, error page, or too thin to say more than the title already says.",
  "",
  "Summaries in the wrong shape, and the right one:",
  "Bad: The page documents how to migrate Drizzle ORM relational queries from v1 to v2.",
  "Good: Relational queries drop the nested with-syntax for relations declared once in a separate file, and v1 queries keep working through a compatibility import.",
  "",
  "Bad: The post describes how Vercel built a software factory for its AI SDK, and claims strong results.",
  "Good: Autonomous agents triage issues and open pull requests for the AI SDK, and produced 25-40% of merged PRs in four weeks, with a human approving every merge.",
  "",
  "Bad: This is a GitHub repository page for boldsoftware/meat. No further details are available.",
  "Good: null",
].join("\n")

export class AiEnricher extends Context.Service<AiEnricher>()(
  "@app/modules/ai/AiEnricher",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig

      if (!config.ai.enabled || !config.ai.apiKey) {
        return {
          enrich: (_input: AiEnrichmentInput) =>
            Effect.succeed<AiEnrichmentResult>({
              tags: Option.none(),
              summary: Option.none(),
            }),
        }
      }

      const apiKey = config.ai.apiKey
      const model = config.ai.model ?? "gpt-5.4-nano"

      return {
        enrich: Effect.fn("AiEnricher.enrich")(function* (input: AiEnrichmentInput) {
          const value = yield* generateOpenAiObject({
            apiKey,
            model,
            objectName: "link_enrichment",
            schema: enrichmentSchema,
            system: enrichmentSystemPrompt,
            prompt: buildPromptText(input),
            operation: "enrich",
          })

          const tags = value.tags

          return {
            tags: tags && tags.length > 0
              ? Option.some(tags as readonly Topic[])
              : Option.none<readonly Topic[]>(),
            summary: value.summary ? Option.some(value.summary) : Option.none<string>(),
          } satisfies AiEnrichmentResult
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

  Option.match(input.content, {
    onNone: () => {},
    onSome: (content) => {
      parts.push("", "Page content:", content)
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
