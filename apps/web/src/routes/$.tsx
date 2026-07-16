import { createFileRoute, notFound } from "@tanstack/react-router"
import { NotFoundPage } from "./-not-found-page"

export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  loader: () => {
    throw notFound()
  },
  notFoundComponent: NotFoundPage,
})
