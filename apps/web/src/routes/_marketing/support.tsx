import { createFileRoute } from "@tanstack/react-router"
import { SupportPage } from "../../pages/support-page"

export const Route = createFileRoute("/_marketing/support")({
  head: () => ({
    meta: [
      { title: "Sleevy Support | Help with Your Read-Later Queue" },
      { name: "description", content: "Get help with Sleevy, your scriptable read-later app for saving and organizing links across devices and automations." },
      { property: "og:title", content: "Sleevy Support" },
      { property: "og:description", content: "Get help with your Sleevy read-later queue, devices, and automations." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/support" },
      { name: "twitter:title", content: "Sleevy Support" },
      { name: "twitter:description", content: "Get help with your Sleevy read-later queue, devices, and automations." },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/support" }],
  }),
  component: SupportPage,
})
