import { createFileRoute } from "@tanstack/react-router"
import { DocsApiReferencePage } from "../../pages/docs/docs-api-reference-page"

export const Route = createFileRoute("/_marketing/docs/api-reference")({
  head: () => ({ meta: [{ title: "API reference | Sleevy API" }, { name: "description", content: "Browse the generated Sleevy API reference from the OpenAPI schema." }], links: [{ rel: "canonical", href: "https://sleevy.app/docs/api-reference" }] }),
  component: DocsApiReferencePage,
})
