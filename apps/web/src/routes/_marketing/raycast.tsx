import { createFileRoute } from "@tanstack/react-router"

import { raycastDeeplink, raycastStoreUrl } from "../../components/marketing/store-links"
import { IntegrationPage } from "../../pages/integration-page"

export const Route = createFileRoute("/_marketing/raycast")({
  head: () => ({
    meta: [
      { title: "Sleevy for Raycast | Save Links from Your Launcher" },
      { name: "description", content: "Use the Sleevy Raycast extension to save links and search your read-later queue without leaving the keyboard." },
      { property: "og:title", content: "Sleevy for Raycast" },
      { property: "og:description", content: "Save links and search your read-later queue without leaving Raycast." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/raycast" },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/raycast" }],
  }),
  component: () => (
    <IntegrationPage
      eyebrow="Raycast extension"
      title="Save links from Raycast."
      description="A Raycast extension for saving the links you find at work, then searching your personal reading queue without leaving the keyboard."
      icon={{ src: "/raycast-82.webp", alt: "Raycast", width: 82, height: 82 }}
      primaryAction={{ href: raycastStoreUrl, label: "View in Raycast Store" }}
      secondaryAction={{
        href: raycastDeeplink,
        label: "Install in Raycast",
        trailingIcon: { src: "/raycast-symbol.svg", alt: "", width: 228, height: 228 },
        openInNewTab: false,
      }}
      proof={{
        eyebrow: "Your library, one shortcut away",
        title: "Search the links you have already saved.",
        body: "Bring up your Sleevy library from Raycast, search by title or site, and open the original page when it becomes useful again. It is a direct view of the same queue you save into from every other Sleevy surface.",
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
