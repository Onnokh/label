import { Callout, CodeBlock, DocsArticle } from "../../components/docs/docs-page"

const toc = [
  { title: "Save from any tool", url: "#save-from-any-tool", depth: 2 },
  { title: "Build a reading view", url: "#build-a-reading-view", depth: 2 },
  { title: "Update reading state", url: "#update-reading-state", depth: 2 },
  { title: "Organize with folders", url: "#organize-with-folders", depth: 2 },
]

export function DocsGuidesPage() {
  return (
    <DocsArticle
      title="Guides"
      description="Small workflows for turning Sleevy into a useful part of your tools."
      toc={toc}
      previous={{ name: "Getting started", description: "Create a key and save your first URL.", url: "/docs/getting-started" }}
    >
      <p>The API is deliberately small. Compose a few focused calls instead of building a second reading-list system around it.</p>

      <h2 id="save-from-any-tool">Save from any tool</h2>
      <p>Capture from a shell, Raycast, a Shortcut, or an internal tool by sending the URL and an optional source label.</p>
      <CodeBlock>{`await fetch("https://api.sleevy.app/v1/captures", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.SLEEVY_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url,
    sourceName: "morning-digest",
    captureChannel: "api",
  }),
})`}</CodeBlock>

      <h2 id="build-a-reading-view">Build a reading view</h2>
      <p>Use the queue endpoint as the data source for a digest, dashboard, or focused list. Ask for unread items when you only want the next thing to read:</p>
      <CodeBlock>{`const response = await fetch(
  "https://api.sleevy.app/v1/saved-items?sort=unread",
  { headers: { Authorization: \`Bearer \${apiKey}\` } },
)

const { savedItems } = await response.json()`}</CodeBlock>

      <h2 id="update-reading-state">Update reading state</h2>
      <p>Mark an item read or unread when your own interface records that change.</p>
      <CodeBlock>{`curl https://api.sleevy.app/v1/saved-items/$ITEM_ID/read \\
  -X POST \\
  -H "Authorization: Bearer $SLEEVY_API_KEY"`}</CodeBlock>
      <p>Use the corresponding <code>/open</code>, <code>/unread</code>, or <code>/read-state</code> operation when your workflow needs a different state transition.</p>

      <h2 id="organize-with-folders">Organize with folders</h2>
      <p>Create a folder once, then assign saved items to it as you capture them.</p>
      <CodeBlock>{`curl https://api.sleevy.app/v1/saved-items/$ITEM_ID/folder \\
  -X PUT \\
  -H "Authorization: Bearer $SLEEVY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"folderId":"$FOLDER_ID"}'`}</CodeBlock>
      <Callout title="No webhooks yet">Sleevy currently supports request-driven automations. There is no webhook delivery endpoint in the current API contract, so schedule a small poll when you need to sync changes.</Callout>
    </DocsArticle>
  )
}
