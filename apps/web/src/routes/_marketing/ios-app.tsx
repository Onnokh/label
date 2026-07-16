import { createFileRoute } from "@tanstack/react-router"

import { appStoreDeeplink, appStoreUrl } from "../../components/marketing/store-links"
import { IntegrationPage } from "../../pages/integration-page"

export const Route = createFileRoute("/_marketing/ios-app")({
  head: () => ({
    meta: [
      { title: "Sleevy for iPhone | iOS Read-Later App" },
      { name: "description", content: "Save links from the iOS share sheet and keep your personal read-later queue in sync with Sleevy for iPhone." },
      { property: "og:title", content: "Sleevy for iPhone" },
      { property: "og:description", content: "Save links from the iOS share sheet and keep your read-later queue in sync." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/ios-app" },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/ios-app" }],
  }),
  component: () => (
    <IntegrationPage
      eyebrow="iOS"
      title="Save links from iOS."
      description="An iOS read-later app that uses the native share sheet to turn an interesting link into something you can return to later."
      icon={{ src: "/ios26-82.webp", alt: "Sleevy for iPhone", width: 82, height: 82 }}
      primaryAction={{ href: appStoreUrl, label: "View in App Store" }}
      secondaryAction={{ href: appStoreDeeplink, label: "Open in App Store", iosOnly: true, openInNewTab: false }}
      proof={{
        eyebrow: "Built into iOS",
        title: "Save from the Share sheet.",
        body: "Choose Sleevy from the native iOS Share sheet. No copying or pasting.",
        image: { src: "/share-sheet-750.webp", alt: "iOS Share sheet with Sleevy available as a save destination", width: 750, height: 906 },
        portrait: true,
      }}
      benefits={[
        { title: "Save links with the iOS share sheet", body: "When you find an article, video, or website in Safari or another iPhone app, open the Share sheet and choose Sleevy. The link is added to your reading queue without copying a URL or switching through a browser tab later." },
        { title: "A calmer way to read on iPhone", body: "Sleevy is for the links that are worth keeping but not worth interrupting your day for. Save them in the moment, then choose what to read from a single queue when you have the time and attention." },
        { title: "Your iPhone queue stays in sync", body: "A link saved through the share extension belongs to your same Sleevy account. It is available from the web companion, the Chrome extension, Raycast, and other tools connected to your personal API." },
        { title: "Can I save a link while offline?", body: "Sleevy can hold a pending capture on the device when a connection is unavailable and send it when connectivity returns. That means a poor signal does not have to make you lose the page you meant to save." },
      ]}
    />
  ),
})
