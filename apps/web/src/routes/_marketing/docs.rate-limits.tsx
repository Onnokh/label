import { createFileRoute } from "@tanstack/react-router"
import { DocsReferencePage } from "../../pages/docs/docs-reference-page"

export const Route = createFileRoute("/_marketing/docs/rate-limits")({
  head: () => ({ meta: [{ title: "Rate limits | Sleevy API" }, { name: "description", content: "Handle Sleevy API-key rate limits and response headers." }], links: [{ rel: "canonical", href: "https://sleevy.app/docs/rate-limits" }] }),
  component: () => <DocsReferencePage kind="rate-limits" />,
})
