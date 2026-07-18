import { createFileRoute } from "@tanstack/react-router"
import { DocsOverviewPage } from "../../pages/docs/docs-overview-page"

export const Route = createFileRoute("/_marketing/docs/overview")({
  head: () => ({ meta: [{ title: "Overview | Sleevy API" }, { name: "description", content: "Understand the Sleevy API model and core capture flow." }], links: [{ rel: "canonical", href: "https://sleevy.app/docs/overview" }] }),
  component: DocsOverviewPage,
})
