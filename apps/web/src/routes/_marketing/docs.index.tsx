import { createFileRoute } from "@tanstack/react-router"
import { DocsHomePage } from "../../pages/docs/docs-home-page"

export const Route = createFileRoute("/_marketing/docs/")({
  head: () => ({ meta: [{ title: "Sleevy API Documentation" }, { name: "description", content: "Build reading workflows with the Sleevy API." }], links: [{ rel: "canonical", href: "https://sleevy.app/docs" }] }),
  component: DocsHomePage,
})
