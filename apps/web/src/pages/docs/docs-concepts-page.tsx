import { Link } from "@tanstack/react-router"

import { CodeBlock, DocsArticle } from "../../components/docs/docs-page"

const toc = [
  { title: "Captures become saved items", url: "#captures-become-saved-items", depth: 2 },
  { title: "Read state and folders", url: "#read-state-and-folders", depth: 2 },
  { title: "Build around stable IDs", url: "#build-around-stable-ids", depth: 2 },
]

export function DocsConceptsPage() {
  return (
    <DocsArticle
      title="Core concepts"
      description="The small set of objects and state transitions behind every Sleevy integration."
      toc={toc}
      previous={{ name: "Getting started", description: "Create a key and save your first URL.", url: "/docs/getting-started" }}
      next={{ name: "Workflows", description: "Save, read, and organize links in practice.", url: "/docs/guides" }}
    >
      <p>Sleevy keeps the API model intentionally close to the way a reading queue works: a capture arrives, becomes a saved item, and moves through a small number of useful states.</p>

      <h2 id="captures-become-saved-items">Captures become saved items</h2>
      <p><code>POST /v1/captures</code> is the write boundary. Send a URL with the channel that produced it, and Sleevy creates or updates the corresponding saved item.</p>
      <CodeBlock>{`{
  "url": "https://example.com/article",
  "captureChannel": "api",
  "sourceName": "morning-digest"
}`}</CodeBlock>
      <p>Read the resulting collection with <code>GET /v1/saved-items</code>. It returns the metadata you need to render a queue: URL, title, preview data, tags, folder, and read state.</p>

      <h2 id="read-state-and-folders">Read state and folders</h2>
      <p>Read state answers “what should I read next?” Folders answer “where does this belong?” Keep those concerns separate in your integration so a focused unread view can still span multiple folders.</p>
      <p>The API exposes explicit operations for marking items read, unread, or opened, plus folder endpoints for creating and assigning folders.</p>

      <h2 id="build-around-stable-ids">Build around stable IDs</h2>
      <p>Capture responses and saved-item responses include stable IDs. Store those IDs when you build a local cache, then use them for state changes instead of matching on titles or URLs.</p>
      <p>Start with the <Link to="/docs/guides">workflow guides →</Link> for concrete requests, or open the <a href="/openapi.json">OpenAPI schema ↗</a> when you need every field and response.</p>
    </DocsArticle>
  )
}
