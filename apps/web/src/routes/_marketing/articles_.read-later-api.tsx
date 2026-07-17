import { createFileRoute } from "@tanstack/react-router"

import { ArticlePage } from "../../pages/article-page"

export const Route = createFileRoute("/_marketing/articles_/read-later-api")({
  head: () => ({
    meta: [
      { title: "Read-Later API: Save URLs from Scripts | Sleevy" },
      { name: "description", content: "Use the Sleevy read-later API to save URLs from scripts, shortcuts, command-line tools, and personal automations." },
      { property: "og:title", content: "Save URLs with a Read-Later API" },
      { property: "og:description", content: "Send links to your personal reading queue from scripts and automations." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://sleevy.app/articles/read-later-api" },
    ],
    links: [{ rel: "canonical", href: "https://sleevy.app/articles/read-later-api" }],
  }),
  component: () => (
    <ArticlePage
      schema={{ url: "https://sleevy.app/articles/read-later-api", datePublished: "2026-07-16" }}
      eyebrow="Read-later API"
      title="Save URLs with a read-later API."
      description="Send links to a personal reading queue from scripts, shortcuts, command-line tools, and your own automations."
      updatedAt={{ dateTime: "2026-07-17", label: "Updated July 2026" }}
      callout={{
        title: "The basic request",
        body: "Create an API key, send an authenticated POST request to /v1/captures, and include the URL you want to save in the JSON body.",
      }}
      sections={[
        {
          title: "Save a URL from a script",
          paragraphs: [
            "The Sleevy API accepts a web address and adds it to the reading queue for your account. That makes it possible to save a URL from a shell script, a shortcut, an internal tool, or any service that can send an HTTP request.",
            "Authenticate with a personal API key in the Authorization header. The API documentation includes a curl request you can run as a first test before connecting a larger automation.",
          ],
        },
        {
          title: "Use one queue instead of another bookmark store",
          paragraphs: [
            "API captures appear beside links saved through the iPhone Share Sheet, Chrome extension, Raycast extension, and web companion. A script can therefore feed the same personal queue you already use manually.",
            "This is useful when the source of a link is predictable but the time to read it is not: a recurring report, a URL copied from another tool, or a page selected by a small personal workflow.",
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
            "The REST API also exposes documented operations for listing and updating your saved links. Use the endpoint reference for current request fields, responses, and authentication requirements.",
          ],
        },
      ]}
      questions={[
        { question: "What can call the read-later API?", answer: "Any script, app, shortcut, or automation service that can make an HTTPS request and safely store your personal API key." },
        { question: "Do API captures sync to the Sleevy apps?", answer: "Yes. Captures made with your API key are added to the same Sleevy account and queue used by the other Sleevy surfaces." },
      ]}
      primaryAction={{ href: "/docs", label: "Open API documentation", openInNewTab: false }}
      closing={{ title: "Send your first URL to Sleevy.", body: "Create an API key and use the quickstart request in the documentation." }}
    />
  ),
})
