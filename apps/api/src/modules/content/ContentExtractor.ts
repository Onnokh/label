import { Effect, Option, Schema } from "effect"

import { PageDocument } from "../fetch/PageFetcher.js"

export class ContentExtraction extends Schema.Class<ContentExtraction>(
  "ContentExtraction",
)({
  url: Schema.String,
  content: Schema.String,
  excerpt: Schema.String,
  wordCount: Schema.Int,
  extractedAt: Schema.Date,
}) { }

export class ContentExtractorError extends Schema.TaggedError<ContentExtractorError>()(
  "ContentExtractorError",
  {
    operation: Schema.String,
    url: Schema.String,
    cause: Schema.Defect,
  },
) { }

export class ContentExtractor extends Effect.Service<ContentExtractor>()(
  "@app/modules/content/ContentExtractor",
  {
    effect: Effect.succeed({
      extract: (page: PageDocument) =>
        Effect.try({
          try: () => buildContentExtraction(page),
          catch: (cause) =>
            new ContentExtractorError({
              operation: "parse",
              url: page.finalUrl,
              cause,
            }),
        }),
    }),
  },
) { }

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")

const normalizeText = (value: string) =>
  decodeHtmlEntities(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()

const stripToText = (html: string) =>
  normalizeText(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|\/p|\/div|\/section|\/article|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )

const extractRegion = (html: string, tagName: string) => {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"))
  return match?.[1]
}

const buildExcerpt = (content: string) => {
  const clipped = content.slice(0, 280)
  const sentenceBoundary = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("? "),
  )

  return sentenceBoundary > 80
    ? clipped.slice(0, sentenceBoundary + 1).trim()
    : clipped.trim()
}

const buildContentExtraction = (page: PageDocument) => {
  const url = page.finalUrl
  const html = page.html
  const focusedHtml =
    extractRegion(html, "article") ??
    extractRegion(html, "main") ??
    extractRegion(html, "body") ??
    html

  const content = stripToText(focusedHtml)
  const words = content.split(/\s+/).filter(Boolean)

  if (content.length < 120 || words.length < 20) {
    return Option.none<ContentExtraction>()
  }

  return Option.some(
    new ContentExtraction({
      url,
      content: content.slice(0, 20_000),
      excerpt: buildExcerpt(content),
      wordCount: words.length,
      extractedAt: new Date(),
    }),
  )
}

export const contentExtractorLayer = ContentExtractor.Default
