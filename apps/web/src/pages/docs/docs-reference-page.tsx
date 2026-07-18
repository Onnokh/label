import { CodeBlock, DocsArticle } from "../../components/docs/docs-page"

type ReferenceKind = "authentication" | "errors" | "rate-limits"

const reference = {
  authentication: {
    title: "Authentication",
    description: "Authenticate API requests with a personal Sleevy API key.",
    toc: [{ title: "Bearer tokens", url: "#bearer-tokens", depth: 2 }, { title: "Keep keys private", url: "#keep-keys-private", depth: 2 }],
  },
  errors: {
    title: "Errors",
    description: "Understand the structured errors returned by the API.",
    toc: [{ title: "Error shape", url: "#error-shape", depth: 2 }, { title: "Status codes", url: "#status-codes", depth: 2 }],
  },
  "rate-limits": {
    title: "Rate limits",
    description: "Handle API-key limits and use response headers to pace requests.",
    toc: [{ title: "API-key limits", url: "#api-key-limits", depth: 2 }, { title: "Response headers", url: "#response-headers", depth: 2 }],
  },
} as const

export function DocsReferencePage({ kind }: { kind: ReferenceKind }) {
  const page = reference[kind]
  return (
    <DocsArticle title={page.title} description={page.description} toc={[...page.toc]}>
      {kind === "authentication" && <>
        <p>Protected Sleevy API routes accept a personal API key as a bearer token. Create one in <a href="/settings">Sleevy settings</a> and send it with every request.</p>
        <h2 id="bearer-tokens">Bearer tokens</h2>
        <CodeBlock>{`curl https://api.sleevy.app/v1/saved-items \\
  -H "Authorization: Bearer $SLEEVY_API_KEY"`}</CodeBlock>
        <h2 id="keep-keys-private">Keep keys private</h2>
        <p>Use environment variables locally and your platform’s secret store in production. Never commit a key or expose it in a browser bundle.</p>
      </>}
      {kind === "errors" && <>
        <p>Errors are JSON objects with a stable <code>_tag</code> and a human-readable <code>message</code>. Some errors include the relevant URL, saved-item ID, or folder ID.</p>
        <h2 id="error-shape">Error shape</h2>
        <CodeBlock>{`{
  "_tag": "Unauthorized",
  "message": "Missing or invalid credentials."
}`}</CodeBlock>
        <h2 id="status-codes">Status codes</h2>
        <ul><li><code>400</code> — invalid URL, folder name, or request input</li><li><code>401</code> — missing or invalid credentials</li><li><code>404</code> — saved item or folder not found</li><li><code>409</code> — folder name conflict</li><li><code>429</code> — API-key rate limit exceeded</li></ul>
      </>}
      {kind === "rate-limits" && <>
        <p>API keys are limited to 20 requests per 60-second window. The limit is applied per API key.</p>
        <h2 id="api-key-limits">API-key limits</h2>
        <p>When the limit is exceeded, the API returns <code>429 Too Many Requests</code> and a <code>Retry-After</code> value in seconds.</p>
        <h2 id="response-headers">Response headers</h2>
        <CodeBlock>{`RateLimit-Limit: 20
RateLimit-Remaining: 19
RateLimit-Reset: 42
Retry-After: 42`}</CodeBlock>
        <p>Use <code>RateLimit-Remaining</code> to pace a queue and wait for <code>RateLimit-Reset</code> or <code>Retry-After</code> before retrying.</p>
      </>}
    </DocsArticle>
  )
}
