import { createFileRoute } from "@tanstack/react-router"
import { DocsGettingStartedPage } from "../../pages/docs/docs-getting-started-page"

export const Route = createFileRoute("/_marketing/docs/getting-started")({
  head: () => ({ meta: [{ title: "Getting started | Sleevy API" }, { name: "description", content: "Create an API key and make your first Sleevy request." }], links: [{ rel: "canonical", href: "https://sleevy.app/docs/getting-started" }] }),
  component: DocsGettingStartedPage,
})
