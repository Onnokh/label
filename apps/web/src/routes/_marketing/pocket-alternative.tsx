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
      { property: "article:modified_time", content: "2026-07-17" },
      { name: "twitter:title", content: "A Pocket Alternative for Your Link Queue | Sleevy" },
      { name: "twitter:description", content: "Keep one synced queue for the links you want to return to." },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/pocket-alternative" }],
  }),
  component: () => (
    <ArticlePage
      schema={{ url: "https://sleevy.app/pocket-alternative", datePublished: "2026-07-16" }}
      eyebrow="Pocket alternative"
      title="A simpler home for the links you mean to return to."
      description="Compare Sleevy with Pocket's former save-for-later workflow, including iPhone and Chrome capture, web access, API automation, and offline reading limitations."
      updatedAt={{ dateTime: "2026-07-17", label: "Updated July 2026" }}
      primaryAction={{ href: appStoreUrl, label: "Get Sleevy for iPhone" }}
      secondaryAction={{ href: "/ios-app", label: "How it works", openInNewTab: false }}
      callout={{
        title: "The short version",
        body: "A replacement does not need to recreate every feature Pocket had. It needs to make it easy to trust the next useful link will still be waiting when you have time for it.",
      }}
      comparison={{
        title: "Pocket and Sleevy compared",
        note: "Pocket's feature rows describe the service before it closed. Sleevy is a synced link queue, not a full article reader.",
        columns: ["Workflow", "Pocket", "Sleevy today"],
        rows: [
          { label: "Availability", values: ["Closed July 8, 2025", "Available"] },
          { label: "Save from iPhone", values: ["Share extension", "iOS Share Sheet"] },
          { label: "Save from Chrome", values: ["Browser extension", "Chrome extension"] },
          { label: "Web library", values: ["Available", "Available"] },
          { label: "Save and search from Raycast", values: ["Not built into Pocket", "Dedicated Raycast extension"] },
          { label: "Automation", values: ["API discontinued with the service", "Personal REST API"] },
          { label: "Full offline article reading", values: ["Supported", "Not supported"] },
          { label: "Pocket data migration", values: ["Export window closed", "No direct Pocket import"] },
        ],
      }}
      sections={[
        {
          title: "Replacing a habit, not just an app",
          paragraphs: [
            "Pocket was rarely the destination. It was the small pause between finding something interesting and deciding whether it deserved your attention. The link left a crowded browser, landed somewhere dependable, and stopped asking for an immediate decision.",
            "That is the habit worth preserving. The right replacement is less about matching a feature checklist and more about making it frictionless to capture a thought without breaking the moment you are in.",
          ],
        },
        {
          title: "Start with how you actually discover things",
          paragraphs: [
            "Some people mostly find articles on their phone. Others collect documentation, repositories, and half-read tabs while working at a computer. A replacement that asks you to change those habits is likely to become another abandoned inbox.",
            "It is worth asking two plain questions: can I save a link where I naturally find it, and can I find it again from where I naturally return to it? Those answers matter more than a long comparison table.",
            "If everything stays inside one browser ecosystem, its native Reading List may already be enough. Sleevy is useful when the same queue needs to cross iPhone, Chrome, Raycast, the web, and your own automations.",
          ],
        },
        {
          title: "Where Sleevy fits",
          paragraphs: [
            "Sleevy is deliberately focused on that handoff. A link can arrive from the iPhone Share sheet, the Chrome extension, Raycast, or a small script. It becomes part of the same personal queue rather than a separate pile for each device.",
            "When you come back, the point is not to manufacture a reading ritual. It is simply to search the queue, filter what matters, and open the original page when you are ready to give it attention.",
          ],
        },
        {
          title: "Choose the shape of the tool, not the loudest replacement",
          paragraphs: [
            "Sleevy makes sense when your saved links need to move with you: from a phone to a browser, from a browser to the keyboard, or from a quick automation back to a single queue. It is a useful fit for people who want their reading list to feel like a lightweight memory rather than another project to maintain.",
            "If your workflow depends on a dedicated offline article reader or extensive annotation tools, choose a service that treats those as first-class concerns. A calm link queue is valuable, but it should not pretend to be every kind of reading tool.",
          ],
        },
      ]}
    />
  ),
})
