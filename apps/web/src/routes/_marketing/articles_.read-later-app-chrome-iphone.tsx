import { createFileRoute } from "@tanstack/react-router"

import { appStoreUrl, chromeStoreUrl } from "../../components/marketing/store-links"
import { ArticlePage } from "../../pages/article-page"

export const Route = createFileRoute("/_marketing/articles_/read-later-app-chrome-iphone")({
  head: () => ({
    meta: [
      { title: "Read-Later App for Chrome and iPhone | Sleevy" },
      { name: "description", content: "Save links from Chrome and iPhone to one synced reading queue with the Sleevy browser extension and iOS Share Sheet." },
      { property: "og:title", content: "A Read-Later App for Chrome and iPhone" },
      { property: "og:description", content: "Save links from Chrome and iPhone to the same synced reading queue." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://sleevy.app/articles/read-later-app-chrome-iphone" },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/articles/read-later-app-chrome-iphone" }],
  }),
  component: () => (
    <ArticlePage
      schema={{ url: "https://sleevy.app/articles/read-later-app-chrome-iphone", datePublished: "2026-07-16" }}
      eyebrow="Cross-device read later"
      title="A read-later app for Chrome and iPhone."
      description="Save links from Chrome and iPhone to the same synced reading queue, then return to them from either device."
      updatedAt={{ dateTime: "2026-07-17", label: "Updated July 2026" }}
      callout={{
        title: "How it works",
        body: "Use the Chrome extension on your computer and the iOS Share Sheet on your iPhone. Both save to the same Sleevy account and reading queue.",
      }}
      proof={{
        title: "The queue is available on the web, too.",
        body: "A link saved from Chrome or iPhone appears in the same Sleevy library when you return to your computer.",
        image: { src: "/web-companion-1209.webp", alt: "A synced Sleevy reading queue open in the web companion", width: 1209, height: 647 },
      }}
      sections={[
        {
          title: "Save the current page from Chrome",
          paragraphs: [
            "Install the Sleevy Chrome extension and connect it to your account. When a page is worth returning to, click the extension in the browser toolbar. Sleevy saves the current URL so the tab no longer has to act as your reminder.",
            "The extension is useful for articles, documentation, products, videos, and research found during desktop browsing. Each link joins the same queue instead of becoming another browser-specific bookmark.",
          ],
        },
        {
          title: "Save from any iPhone app",
          paragraphs: [
            "On iPhone, open the Share Sheet in Safari or another app and choose Sleevy. The shared link is added to your account without copying and pasting it into a separate app.",
            "If the phone is offline, Sleevy can hold a pending capture on the device and send it when connectivity returns.",
          ],
        },
        {
          title: "Keep one reading list across Chrome and iPhone",
          paragraphs: [
            "A link saved in Chrome appears in the same queue you use on iPhone, and a link saved from iPhone is available through the web companion when you return to your computer. There is no manual export or separate reading list to reconcile.",
            "You can also add to that queue through Raycast or the Sleevy API. Those are additional ways to save and find links, not separate libraries.",
          ],
        },
        {
          title: "What Sleevy syncs",
          paragraphs: [
            "Sleevy syncs your saved links and the metadata it can retrieve for them. It is a link-saving and read-later queue; it does not promise an offline copy of every article or website.",
          ],
        },
      ]}
      questions={[
        { question: "Can I save links from apps other than Safari?", answer: "Yes. Any iPhone app that shares a web URL through the standard iOS Share Sheet can send that link to Sleevy." },
        { question: "Can I open Chrome links on my iPhone later?", answer: "Yes. Links saved with the Chrome extension sync to the same Sleevy account and can be opened from your queue on iPhone." },
      ]}
      relatedLinks={[
        { href: "/web-companion", label: "View the Sleevy web companion", openInNewTab: false },
        { href: "/docs", label: "Save links with the Sleevy API", openInNewTab: false },
        { href: "/pocket-alternative", label: "Compare Sleevy with Pocket", openInNewTab: false },
      ]}
      primaryAction={{ href: appStoreUrl, label: "View in App Store" }}
      secondaryAction={{ href: chromeStoreUrl, label: "View in Chrome Web Store" }}
      closing={{ title: "Use one queue on Chrome and iPhone.", body: "Add Sleevy to both devices and save links wherever you find them." }}
    />
  ),
})
