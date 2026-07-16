import { createFileRoute } from "@tanstack/react-router"

import { chromeStoreUrl } from "../../components/marketing/store-links"
import { IntegrationPage } from "../../pages/integration-page"

export const Route = createFileRoute("/_marketing/chrome-extension")({
  head: () => ({
    meta: [
      { title: "Chrome Read-Later Extension: Save Tabs for Later | Sleevy" },
      { name: "description", content: "Save tabs for later with the Sleevy Chrome read-later extension. Add the page you are viewing to one synced reading queue in one click." },
      { property: "og:title", content: "Chrome Read-Later Extension | Sleevy" },
      { property: "og:description", content: "Save tabs for later in Chrome and keep one synced reading queue." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/chrome-extension" },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/chrome-extension" }],
  }),
  component: () => (
    <IntegrationPage
      eyebrow="Chrome extension"
      title="Save tabs for later in Chrome."
      description="Save tabs for later in Chrome and add the page you are viewing to one synced read-later queue in one click."
      intro="Use the Chrome read-later extension to save tabs for later and keep the useful pages you find in one synced queue."
      icon={{ src: "/chrome-76.webp", alt: "Google Chrome", width: 76, height: 82 }}
      primaryAction={{ href: chromeStoreUrl, label: "View in Chrome Web Store" }}
      benefits={[
        { title: "Save the tab you are reading", body: "Install the Sleevy Chrome extension, connect it to your account, and click the toolbar icon on any normal web page. The extension captures the current URL, so you can close a tab without losing an article, product, documentation page, or reference." },
        { title: "Why use a Chrome read-later extension?", body: "Open tabs are a poor reading queue: they disappear across devices and make it hard to decide what still matters. Sleevy turns a browser tab into a saved item you can revisit later, rather than another thing to keep open." },
        { title: "Keep browser research in one place", body: "The Chrome extension adds browser finds to the same personal library as links saved on your phone, through Raycast, or with the Sleevy API. That makes it easier to search your queue and keep a reliable record of things worth returning to." },
        { title: "What happens after I save a tab?", body: "Sleevy stores the URL and its available metadata in your account. You can then read it from the web companion or another connected Sleevy surface whenever you have time." },
      ]}
    />
  ),
})
