import { createFileRoute } from "@tanstack/react-router"
import { DocsConceptsPage } from "../../pages/docs/docs-concepts-page"

export const Route = createFileRoute("/_marketing/docs/concepts")({
  head: () => ({ meta: [{ title: "Core concepts | Sleevy API" }, { name: "description", content: "Understand captures, saved items, read state, folders, and stable IDs in the Sleevy API." }], links: [{ rel: "canonical", href: "https://sleevy.app/docs/concepts" }] }),
  component: DocsConceptsPage,
})
