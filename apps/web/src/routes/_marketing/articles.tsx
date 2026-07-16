import { createFileRoute } from "@tanstack/react-router"

import { ArticlesPage } from "../../pages/articles-page"

export const Route = createFileRoute("/_marketing/articles")({
  head: () => ({
    meta: [
      { title: "Articles | Sleevy" },
      { name: "description", content: "Articles about saving links, choosing calmer tools, and finding your way back to what matters." },
      { property: "og:title", content: "Articles | Sleevy" },
      { property: "og:description", content: "Thoughtful notes on saving links and returning to what matters." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/articles" },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/articles" }],
  }),
  component: ArticlesPage,
})
