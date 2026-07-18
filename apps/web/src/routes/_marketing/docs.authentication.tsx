import { createFileRoute } from "@tanstack/react-router"
import { DocsReferencePage } from "../../pages/docs/docs-reference-page"

export const Route = createFileRoute("/_marketing/docs/authentication")({
  head: () => ({ meta: [{ title: "Authentication | Sleevy API" }, { name: "description", content: "Authenticate Sleevy API requests with a personal API key." }], links: [{ rel: "canonical", href: "https://sleevy.app/docs/authentication" }] }),
  component: () => <DocsReferencePage kind="authentication" />,
})
