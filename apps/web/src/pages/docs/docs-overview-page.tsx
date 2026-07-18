import { Link } from "@tanstack/react-router"

import { Callout, CodeBlock, DocsArticle } from "../../components/docs/docs-page"

const toc = [
  { title: "What you can build", url: "#what-you-can-build", depth: 2 },
  { title: "The core flow", url: "#the-core-flow", depth: 2 },
  { title: "Authentication", url: "#authentication", depth: 2 },
]

export function DocsOverviewPage() {
  return (
    <DocsArticle
      title="Sleevy API"
      description="Save links from scripts, shortcuts, and personal tools, then keep one reading queue in sync."
      toc={toc}
      next={{ name: "Getting started", description: "Create a key and save your first URL.", url: "/docs/getting-started" }}
    >
      <p>Sleevy is a small, personal REST API for the links you intend to read later.</p>
      <p>Use it when a URL starts in a shell script, a Raycast command, a Shortcut, or a tool you are building. Sleevy gives that link a home alongside everything you saved from your other devices.</p>

      <h2 id="what-you-can-build">What you can build</h2>
      <ul>
        <li>Save a URL from any tool that can make an HTTP request.</li>
        <li>Build a digest from the links in your queue.</li>
        <li>Mark items read, unread, or opened as your workflow changes.</li>
        <li>Organize saved links into folders.</li>
      </ul>

      <h2 id="the-core-flow">The core flow</h2>
      <p>Most integrations only need three operations:</p>
      <ol>
        <li>Create an API key in Sleevy settings.</li>
        <li>Capture a URL with <code>POST /v1/captures</code>.</li>
        <li>Read it back with <code>GET /v1/saved-items</code>.</li>
      </ol>
      <CodeBlock>{`curl https://api.sleevy.app/v1/captures \\
  -X POST \\
  -H "Authorization: Bearer $SLEEVY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/article","captureChannel":"api"}'`}</CodeBlock>

      <h2 id="authentication">Authentication</h2>
      <p>Send your key as a bearer token on every endpoint except the health check:</p>
      <CodeBlock>{`Authorization: Bearer $SLEEVY_API_KEY`}</CodeBlock>
      <Callout title="Keep your key private">Store it in an environment variable or your platform's secret store. Never commit it to a repository or ship it in a browser bundle.</Callout>
      <p>Ready to make the first request? <Link to="/docs/getting-started">Follow the getting started guide →</Link></p>
    </DocsArticle>
  )
}
