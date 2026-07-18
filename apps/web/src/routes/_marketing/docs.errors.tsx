import { createFileRoute } from "@tanstack/react-router"
import { DocsReferencePage } from "../../pages/docs/docs-reference-page"

export const Route = createFileRoute("/_marketing/docs/errors")({
  head: () => ({ meta: [{ title: "Errors | Sleevy API" }, { name: "description", content: "Understand structured errors and status codes returned by the Sleevy API." }], links: [{ rel: "canonical", href: "https://sleevy.app/docs/errors" }] }),
  component: () => <DocsReferencePage kind="errors" />,
})
