import { createFileRoute } from "@tanstack/react-router"

import { ArticlePage } from "../../pages/article-page"

export const Route = createFileRoute("/_marketing/articles_/bookmark-manager-for-developers")({
  head: () => ({
    meta: [
      { title: "A Bookmark Manager for Developers | Sleevy" },
      { name: "description", content: "Sleevy is a developer read-later app: save links from Raycast, Chrome, iPhone, or your own scripts into one searchable research queue." },
      { property: "og:title", content: "A Bookmark Manager for Developers" },
      { property: "og:description", content: "Save links from the tools you already use — Raycast, Chrome, scripts — into one personal research queue." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://sleevy.app/articles/bookmark-manager-for-developers" },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/articles/bookmark-manager-for-developers" }],
  }),
  component: () => (
    <ArticlePage
      schema={{ url: "https://sleevy.app/articles/bookmark-manager-for-developers", datePublished: "2026-07-16" }}
      eyebrow="Developer workflow"
      title="A bookmark manager for developers."
      description="Save links from Raycast, Chrome, iPhone, or your own scripts into one personal research queue you can actually come back to."
      updatedAt={{ dateTime: "2026-07-17", label: "Updated July 2026" }}
      callout={{
        title: "The developer angle",
        body: "Every Sleevy surface — Raycast, Chrome extension, iPhone Share Sheet, and a documented REST API — feeds the same queue, so scripts and manual saves land in one place.",
      }}
      sections={[
        {
          title: "Save a link without leaving your tools",
          paragraphs: [
            "Most bookmarking friction comes from switching context. Sleevy meets you where you already work: save the current tab from the Chrome extension, save a URL from your clipboard with the Raycast extension, or share a page from Safari on iPhone.",
            "For everything else there is the read-later API: send an authenticated POST request to /v1/captures from a shell script, a shortcut, an internal tool, or any service that can make an HTTP request. The API documentation includes a curl request you can run as a first test.",
          ],
        },
        {
          title: "One research link manager instead of scattered bookmarks",
          paragraphs: [
            "API captures appear beside links saved through the iPhone Share Sheet, Chrome extension, Raycast extension, and web companion. A script can therefore feed the same personal queue you already use manually.",
            "This is useful when the source of a link is predictable but the time to read it is not: a recurring report, a URL copied from another tool, or a page selected by a small personal workflow. Everything lands in one searchable queue instead of a browser bookmarks folder you never reopen.",
          ],
        },
        {
          title: "Keep the automation small",
          paragraphs: [
            "Start with one capture request and confirm that it reaches your queue. Then add the trigger that suits your workflow. Keeping the saving step separate from the trigger makes failures easier to understand.",
            "The public API supports the endpoints documented on the Sleevy site. Do not build around an assumed webhook or integration that is not listed there.",
          ],
        },
        {
          title: "Manage saved links through the API",
          paragraphs: [
            "The REST API also exposes documented operations for listing and updating your saved links. Use the endpoint reference in the API documentation for current request fields, responses, and authentication requirements.",
          ],
        },
      ]}
      questions={[
        { question: "Is Sleevy a bookmark manager or a read-later app?", answer: "Both, in practice: it is a personal queue for links you mean to return to, with search across everything you have saved — closer to a research link manager than a folder tree of bookmarks." },
        { question: "What can call the read-later API?", answer: "Any script, app, shortcut, or automation service that can make an HTTPS request and safely store your personal API key." },
        { question: "Do API captures sync to the Sleevy apps?", answer: "Yes. Captures made with your API key are added to the same Sleevy account and queue used by the other Sleevy surfaces." },
      ]}
      relatedLinks={[
        { href: "/docs", label: "Sleevy API documentation", openInNewTab: false },
        { href: "/raycast", label: "Sleevy for Raycast", openInNewTab: false },
        { href: "/pocket-alternative", label: "Looking for a Pocket alternative?", openInNewTab: false },
      ]}
      primaryAction={{ href: "/docs", label: "Open API documentation", openInNewTab: false }}
      closing={{ title: "Send your first URL to Sleevy.", body: "Create an API key and use the quickstart request in the documentation." }}
    />
  ),
})
