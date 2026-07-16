import { createFileRoute } from "@tanstack/react-router"

import { AppLayout } from "../components/app-layout/app-layout"

export const Route = createFileRoute("/_app")({
  ssr: false,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: AppLayout,
})
