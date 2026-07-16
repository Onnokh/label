import { createFileRoute } from "@tanstack/react-router"

import { raycastDeeplink, raycastStoreUrl } from "../../components/marketing/store-links"
import { IntegrationPage } from "../../pages/integration-page"

export const Route = createFileRoute("/_marketing/raycast")({
  head: () => ({
    meta: [
      { title: "Raycast Read-Later Extension: Save and Search Links | Sleevy" },
      { name: "description", content: "Save links with the Sleevy Raycast read-later extension and search your synced queue without leaving the keyboard." },
      { property: "og:title", content: "Raycast Read-Later Extension | Sleevy" },
      { property: "og:description", content: "Save links and search your read-later queue without leaving Raycast." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/raycast" },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/raycast" }],
  }),
  component: () => (
    <IntegrationPage
      eyebrow="Raycast extension"
      title="Save and search links with Raycast."
      description="Use the Sleevy Raycast read-later extension to save URLs from your clipboard and search your synced queue from the launcher."
      intro="Save a link with Raycast while you work, then search the same read-later queue from Raycast, Chrome, iPhone, or the web."
      icon={{ src: "/raycast-82.webp", alt: "Raycast", width: 82, height: 82 }}
      primaryAction={{ href: raycastStoreUrl, label: "View in Raycast Store" }}
      secondaryAction={{
        href: raycastDeeplink,
        label: "Install in Raycast",
        trailingIcon: { src: "/raycast-symbol.svg", alt: "", width: 228, height: 228 },
        openInNewTab: false,
      }}
      relatedLink={{ href: "/articles/save-links-with-raycast", label: "Read the Raycast link-saving guide" }}
      proof={{
        title: "Your saved work stays close.",
        body: "One shortcut opens your library whenever a reference comes back into play.",
        image: { src: "/raycast-search-1508.webp", alt: "Sleevy saved links shown in Raycast search", width: 1508, height: 942 },
      }}
      benefits={[
        { title: "How the Sleevy Raycast extension works", body: "Copy a link, open Raycast, and run the Sleevy command to save it. Sleevy checks that the clipboard contains a web address, adds it to your queue, and confirms when it is saved—so you can keep moving instead of opening a separate read-later app." },
        { title: "Search saved links from Raycast", body: "The extension also gives you a fast way to browse your Sleevy library. Search saved articles, websites, videos, and repositories from the Raycast launcher, then open the original page when you are ready to return to it." },
        { title: "A read-later workflow for keyboard users", body: "Raycast is useful when most of your research happens at a desktop. Save a reference while you work, use your queue as a lightweight memory, and pick it up later from Sleevy on the web or iPhone." },
        { title: "Does it sync with other Sleevy apps?", body: "Yes. Items saved with the Raycast extension go into the same Sleevy account and reading queue as items saved through the Chrome extension, iOS share sheet, web companion, or personal API." },
      ]}
    />
  ),
})
