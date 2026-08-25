import { createFileRoute } from "@tanstack/react-router"
import { MarketingLayout } from "./-marketing-layout"

export const Route = createFileRoute("/_marketing")({
  head: () => ({
    meta: [{ name: "theme-color", content: "#101113" }],
  }),
  component: MarketingLayout,
})
