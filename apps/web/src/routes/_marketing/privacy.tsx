import { createFileRoute } from "@tanstack/react-router"
import { PrivacyPage } from "../../pages/privacy-page"

export const Route = createFileRoute("/_marketing/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Sleevy" },
      { name: "description", content: "Read Sleevy's privacy policy, including how we handle accounts, saved links, metadata, and deletion requests." },
      { property: "og:title", content: "Privacy Policy | Sleevy" },
      { property: "og:description", content: "How Sleevy handles accounts, saved links, metadata, and deletion requests." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/privacy" },
      { name: "twitter:title", content: "Privacy Policy | Sleevy" },
      { name: "twitter:description", content: "How Sleevy handles accounts, saved links, metadata, and deletion requests." },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/privacy" }],
  }),
  component: PrivacyPage,
})
