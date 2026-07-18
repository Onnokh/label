import { Link } from "@tanstack/react-router"

import { Callout, CodeBlock, DocsArticle } from "../../components/docs/docs-page"

const toc = [
  { title: "Create an API key", url: "#create-an-api-key", depth: 2 },
  { title: "Save your first URL", url: "#save-your-first-url", depth: 2 },
  { title: "Read your queue", url: "#read-your-queue", depth: 2 },
]

export function DocsGettingStartedPage() {
  return (
    <DocsArticle
      title="Getting started"
      description="Create a key, save one URL, and read it back from your queue."
      toc={toc}
      previous={{ name: "Overview", description: "What you can build with the Sleevy API.", url: "/docs" }}
      next={{ name: "Guides", description: "Save, read, and organize links in workflows.", url: "/docs/guides" }}
    >
      <p>This guide takes one URL from your terminal into Sleevy. The same requests work from any script or automation that can send JSON over HTTPS.</p>

      <h2 id="create-an-api-key">Create an API key</h2>
      <p>Open <a href="/settings">Sleevy settings</a>, create a personal API key, and export it in the shell where you will make the request:</p>
      <CodeBlock>{`export SLEEVY_API_KEY="your-key-here"`}</CodeBlock>
      <Callout title="Use a secret store in production">Environment variables are convenient for local scripts. For deployed automations, use the secret storage provided by your host.</Callout>

      <h2 id="save-your-first-url">Save your first URL</h2>
      <p>Send the URL to the capture endpoint. Sleevy returns the saved item and tells you whether it created a new record or updated an existing one.</p>
      <CodeBlock>{`curl https://api.sleevy.app/v1/captures \\
  -X POST \\
  -H "Authorization: Bearer $SLEEVY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/article",
    "captureChannel": "api"
  }'`}</CodeBlock>

      <h2 id="read-your-queue">Read your queue</h2>
      <p>Fetch saved items with the same key. Sort by newest, oldest, title, or unread items when you are building a focused view.</p>
      <CodeBlock>{`curl "https://api.sleevy.app/v1/saved-items?sort=newest" \\
  -H "Authorization: Bearer $SLEEVY_API_KEY"`}</CodeBlock>
      <p>The response contains <code>savedItems</code>. Each item includes its URL, title and preview metadata, tags, folder, and read state.</p>
      <p>Continue with the <Link to="/docs/guides">workflow guides →</Link> or use the <a href="/openapi.json">OpenAPI schema ↗</a> for the complete contract.</p>
    </DocsArticle>
  )
}
