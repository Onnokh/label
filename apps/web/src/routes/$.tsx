import { createFileRoute } from "@tanstack/react-router"
import { NotFoundPage } from "./-not-found-page"

export const Route = createFileRoute("/$")({
  component: NotFoundPage,
})
