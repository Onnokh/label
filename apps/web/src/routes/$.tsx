import { createFileRoute, notFound } from "@tanstack/react-router"
import { NotFoundPage } from "./-not-found-page"

export const Route = createFileRoute("/$")({
  loader: () => {
    throw notFound()
  },
  notFoundComponent: NotFoundPage,
})
