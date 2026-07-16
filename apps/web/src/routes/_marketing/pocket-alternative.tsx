import { createFileRoute } from "@tanstack/react-router"

import { appStoreUrl } from "../../components/marketing/store-links"
import { ArticlePage } from "../../pages/article-page"

export const Route = createFileRoute("/_marketing/pocket-alternative")({
  head: () => ({
    meta: [
      { title: "Pocket Alternative for Saving Links | Sleevy" },
      { name: "description", content: "Looking for a Pocket alternative? Sleevy gives you one synced queue for links saved from iPhone, Chrome, Raycast, and your own scripts." },
      { property: "og:title", content: "A Pocket Alternative for Your Link Queue | Sleevy" },
      { property: "og:description", content: "Keep one synced queue for the links you want to return to." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://sleevy.app/pocket-alternative" },
      { property: "article:modified_time", content: "2026-07-16" },
      { name: "twitter:title", content: "A Pocket Alternative for Your Link Queue | Sleevy" },
      { name: "twitter:description", content: "Keep one synced queue for the links you want to return to." },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/pocket-alternative" }],
  }),
  component: () => (
    <ArticlePage
      eyebrow="Pocket alternative"
      title="A simpler home for the links you mean to return to."
      description="Pocket is no longer available. Sleevy keeps one calm queue for the articles, videos, references, and tabs you find across your day."
      updatedAt={{ dateTime: "2026-07-16", label: "Updated July 2026" }}
      primaryAction={{ href: appStoreUrl, label: "Get Sleevy for iPhone" }}
      callout={{
        title: "The short version",
        body: "Sleevy is built for saving a link in the moment and finding it again later—whether you are on your iPhone, in Chrome, at your keyboard with Raycast, or working in a script.",
      }}
      sections={[
        {
          title: "Pocket is gone. The reading problem is not.",
          paragraphs: [
            "Finding something useful is easy. Giving it your full attention right then usually is not. A good read-later queue lets you close the tab, carry on with your day, and trust that the link will still be there when you are ready.",
            "Sleevy keeps that job deliberately small: capture the link, keep it in one personal queue, and return when it matters.",
          ],
        },
        {
          title: "Save from the tools you already use.",
          paragraphs: [
            "On iPhone, save a page through the Share sheet. In Chrome, capture the current tab in one click. In Raycast, save and search links without leaving the keyboard. Your own scripts can add links through the personal REST API too.",
            "Every capture arrives in the same Sleevy account, so a link found on one device is waiting from the next one.",
          ],
        },
        {
          title: "A queue, not another place to manage.",
          paragraphs: [
            "Sleevy is for the things that are worth keeping but do not need action yet. Use it to clear research tabs, collect a few articles for later, or hold onto a useful reference without turning your browser into a to-do list.",
            "When you come back, search your saved links, filter the queue, and open the original page when you have the time to give it attention.",
          ],
        },
        {
          title: "Is Sleevy the right Pocket alternative for you?",
          paragraphs: [
            "Choose Sleevy if your main need is a reliable, synced place to save links from the surfaces where you discover them. It is especially useful if you want iPhone sharing, Chrome capture, keyboard access, and a lightweight API in one workflow.",
            "If your workflow depends on a dedicated offline article reader or extensive annotation tools, make sure the product you choose supports those needs before committing to a new workflow.",
          ],
        },
      ]}
      questions={[
        { question: "Can I save a link from my iPhone?", answer: "Yes. Use the Sleevy action in the iOS Share sheet to add a link to your queue." },
        { question: "Does Sleevy work with Chrome?", answer: "Yes. The Sleevy Chrome extension saves the tab you are viewing to your queue." },
        { question: "Can I automate link saving?", answer: "Yes. Sleevy provides a personal REST API for capturing links from scripts and automations." },
      ]}
    />
  ),
})
