import { createFileRoute } from "@tanstack/react-router"
import { MarketingLayout } from "./-marketing-layout"
import "../styles/marketing.css"

export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
})
