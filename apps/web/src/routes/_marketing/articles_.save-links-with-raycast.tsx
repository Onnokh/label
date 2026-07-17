import { createFileRoute } from "@tanstack/react-router"

import { raycastStoreUrl } from "../../components/marketing/store-links"
import { ArticlePage } from "../../pages/article-page"

export const Route = createFileRoute("/_marketing/articles_/save-links-with-raycast")({
  head: () => ({
    meta: [
      { title: "How to Save Links with Raycast | Sleevy" },
      { name: "description", content: "Save links with Raycast, search your read-later queue, and open saved articles, websites, videos, and repositories from the launcher." },
      { property: "og:title", content: "How to Save Links with Raycast" },
      { property: "og:description", content: "Use Raycast to save URLs and search a synced read-later queue." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://sleevy.app/articles/save-links-with-raycast" },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/articles/save-links-with-raycast" }],
  }),
  component: () => (
    <ArticlePage
      schema={{ url: "https://sleevy.app/articles/save-links-with-raycast", datePublished: "2026-07-16" }}
      eyebrow="Raycast read later"
      title="How to save links with Raycast."
      description="Use Raycast to save a URL from your clipboard, search your read-later queue, and reopen saved links without leaving the launcher."
      updatedAt={{ dateTime: "2026-07-17", label: "Updated July 2026" }}
      callout={{
        title: "The short version",
        body: "Install the Sleevy extension from the Raycast Store. Copy a URL and run the save command, or open the search command to find a link already in your queue.",
      }}
      sections={[
        {
          title: "Save a link from your clipboard",
          paragraphs: [
            "Copy the URL of the article, website, video, or repository you want to keep. Open Raycast, find the Sleevy save command, and run it. The extension checks the clipboard for a web address and adds that URL to your Sleevy queue.",
            "This works well when a useful reference appears during desktop work. You can file it without opening another app, choosing a folder, or leaving a tab open as a reminder.",
          ],
        },
        {
          title: "Search saved links without leaving Raycast",
          paragraphs: [
            "The search command opens your Sleevy library inside Raycast. Search the saved title, site, description, or tag, choose the result you need, and open the original page.",
            "That turns the launcher into a quick way back to documentation, research, articles, and other links you have already decided are worth keeping.",
          ],
        },
        {
          title: "Use the same queue on every device",
          paragraphs: [
            "Links saved with Raycast go into the same Sleevy account as links saved from the Chrome extension, the iPhone Share Sheet, the web companion, or the personal API. You do not need a separate bookmark collection for the launcher.",
            "A link saved at your desk can be waiting on your phone later, and something saved on your phone can be found through Raycast when you return to your Mac.",
          ],
        },
        {
          title: "When a Raycast read-later workflow fits",
          paragraphs: [
            "Raycast is most useful here when you already work from the keyboard and want saving or retrieval to take only a command. Sleevy remains the underlying reading queue; Raycast is one fast way into it.",
          ],
        },
      ]}
      questions={[
        { question: "Can Raycast search links saved from my iPhone?", answer: "Yes. As long as both surfaces use the same Sleevy account, links saved from iPhone, Chrome, the web, Raycast, or the API appear in the same queue." },
        { question: "Does the extension replace Raycast bookmarks?", answer: "It is intended for a personal read-later queue rather than launcher shortcuts. Use it for links you want to return to and search later." },
      ]}
      relatedLinks={[{ href: "/docs", label: "Sleevy API documentation", openInNewTab: false }]}
      primaryAction={{ href: raycastStoreUrl, label: "View in Raycast Store" }}
      secondaryAction={{ href: "/raycast", label: "About Sleevy for Raycast", openInNewTab: false }}
      closing={{ title: "Add Sleevy to Raycast.", body: "Save the URL on your clipboard and search the same reading queue you use elsewhere." }}
    />
  ),
})
