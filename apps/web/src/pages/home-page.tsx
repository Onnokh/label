import { useState, type ReactNode } from "react"

const raycastStoreUrl = "https://www.raycast.com/onnokh/sleevy"

const captureMethods = [
  {
    title: "Raycast Plugin",
    body: "Capture from your launcher and keep moving.",
    action: "Install on Raycast",
    href: raycastStoreUrl,
    icon: "/raycast-82.webp",
    iconWidth: 82,
    iconHeight: 82,
  },
  {
    title: "Native Share",
    body: "Tap the share button on any page or link, pick Sleeve, and it lands in your queue.",
    action: "Install Sleevy",
    href: "https://apps.apple.com/nl/app/sleevy/id6770653332",
    icon: "/ios26-82.webp",
    iconWidth: 82,
    iconHeight: 82,
  },
  {
    title: "Chrome Extension",
    body: "Click the Sleeve icon in your toolbar. The current tab is captured instantly.",
    action: "Install Extension",
    href: "https://chromewebstore.google.com/detail/sleevy/ogffdakffimomfahfpihfmgdaincemjj",
    icon: "/chrome-76.webp",
    iconWidth: 76,
    iconHeight: 82,
  },
  {
    title: "Web Companion",
    body: "Paste a URL into the web app and hit save when you are already browsing on desktop.",
    action: "Login",
    href: "/inbox",
    icon: "/app-icon-160.webp",
    iconWidth: 160,
    iconHeight: 160,
  },
]

const companionFeatures = [
  {
    eyebrow: "sync",
    title: "Save on one, read on the other",
    body: "They sync before you can open your inbox, your items are everywhere.",
  },
  {
    eyebrow: "filter",
    title: "Tags, sources, full-text",
    body: "Filter your queue by tag or capture source.",
  },
  {
    eyebrow: "keyboard",
    title: "Fully driveable from the keys",
    body: "j/k to navigate, o to open, n to capture and fuzzy find from the command palette.",
  },
]

const apiExamples = {
  capture: (
    <>
      <span className="terminal-comment"># Save a link from anywhere with an HTTP request</span>
      <span><span className="terminal-muted">$</span> curl -X POST https://api.sleevy.app/v1/captures \</span>
      <span>  -H <span className="terminal-string">"Authorization: Bearer $SLEEVY_API_KEY"</span> \</span>
      <span>  -H <span className="terminal-string">"Content-Type: application/json"</span> \</span>
      <span>  -d <span className="terminal-string">'{`{`}</span></span>
      <span className="terminal-string">      "url": "https://notes.dev/tiny-css",</span>
      <span className="terminal-string">      "captureChannel": "api",</span>
      <span className="terminal-string">      "tags": ["design", "front-end"]</span>
      <span>    <span className="terminal-string">{`}`}'</span></span>
      <span />
      <span>{`{`}</span>
      <span>  <span className="terminal-key">"savedItem"</span>: {`{`}</span>
      <span>    <span className="terminal-key">"id"</span>: <span className="terminal-string">"itm_8f2c9a"</span>,</span>
      <span>    <span className="terminal-key">"originalUrl"</span>: <span className="terminal-string">"https://notes.dev/tiny-css"</span>,</span>
      <span>    <span className="terminal-key">"title"</span>: <span className="terminal-string">"The case for tiny stylesheets"</span>,</span>
      <span>    <span className="terminal-key">"type"</span>: <span className="terminal-string">"article"</span>,</span>
      <span>    <span className="terminal-key">"tags"</span>: [<span className="terminal-string">"design"</span>, <span className="terminal-string">"front-end"</span>],</span>
      <span>    <span className="terminal-key">"lastSavedAt"</span>: <span className="terminal-string">"2026-05-08T14:21:09Z"</span>,</span>
      <span>    <span className="terminal-muted">...</span></span>
      <span>  {`}`},</span>
      <span>  <span className="terminal-key">"captureResult"</span>: <span className="terminal-string">"created"</span></span>
      <span>{`}`}</span>
      <span />
      <span><span className="terminal-muted">$</span> <span className="terminal-success">Saved to queue - open in app</span></span>
    </>
  ),
  queue: (
    <>
      <span className="terminal-comment"># Pull the latest items waiting in your queue</span>
      <span><span className="terminal-muted">$</span> curl https://api.sleevy.app/v1/saved-items?sort=newest \</span>
      <span>  -H <span className="terminal-string">"Authorization: Bearer $SLEEVY_API_KEY"</span></span>
      <span />
      <span>{`{`}</span>
      <span>  <span className="terminal-key">"savedItems"</span>: [</span>
      <span>    {`{`}</span>
      <span>      <span className="terminal-key">"id"</span>: <span className="terminal-string">"itm_8f2c9a"</span>,</span>
      <span>      <span className="terminal-key">"originalUrl"</span>: <span className="terminal-string">"https://notes.dev/tiny-css"</span>,</span>
      <span>      <span className="terminal-key">"title"</span>: <span className="terminal-string">"The case for tiny stylesheets"</span>,</span>
      <span>      <span className="terminal-key">"tags"</span>: [<span className="terminal-string">"design"</span>, <span className="terminal-string">"front-end"</span>],</span>
      <span>      <span className="terminal-key">"lastSavedAt"</span>: <span className="terminal-string">"2026-05-08T14:21:09Z"</span>,</span>
      <span>      <span className="terminal-muted">...</span></span>
      <span>    {`}`}</span>
      <span>  ]</span>
      <span>{`}`}</span>
    </>
  ),
} satisfies Record<string, ReactNode>

export function HomePage() {
  const [apiExample, setApiExample] = useState<keyof typeof apiExamples>("capture")

  return (
    <>
      <section className="marketing-hero">
        <div className="marketing-copy">
          <h1>
            <span>Sleeve it.</span>
            <span>Read it later.</span>
          </h1>
          <p>
            A scriptable bookmark manager app for iOS, Raycast, Chrome, web, and API workflows. One tap to save,
            every device in sync.
          </p>
          <p>
            Now live on <a href={raycastStoreUrl}>Raycast</a>.
          </p>
          <div className="marketing-actions">
            <a className="marketing-app-store" href="https://apps.apple.com/nl/app/sleevy/id6770653332" aria-label="Download on the App Store">
              <img src="/app-store-352.webp" alt="Download on the App Store" width={352} height={118} />
            </a>
            <a className="marketing-docs-link" id="docs" href="/docs">Read the docs</a>
          </div>
        </div>

        <div className="marketing-device">
          <img className="marketing-gradient" src="/gradient-588.webp" alt="" width={588} height={588} fetchPriority="high" />
          <div className="marketing-phone">
            <img
              src="/app-502.webp"
              srcSet="/app-502.webp 502w, /app-630.webp 630w"
              sizes="(max-width: 760px) min(72vw, 21rem), 502px"
              alt=""
              width={502}
              height={1088}
              fetchPriority="high"
            />
          </div>
        </div>
      </section>

      <section className="capture-section">
        <p className="marketing-eyebrow">one-click capture</p>
        <h2>Save from wherever you are.</h2>
        <div className="capture-grid">
          {captureMethods.map((method) => (
            <article className="capture-card" key={method.title}>
              <img src={method.icon} alt="" width={method.iconWidth} height={method.iconHeight} loading="lazy" />
              <h3>{method.title}</h3>
              <p>{method.body}</p>
              {method.action ? <a className={method.href ? undefined : "disabled"} href={method.href ?? "#"}>{method.action}</a> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="companion-section">
        <p className="marketing-eyebrow">companion</p>
        <h2>Your links, organized everywhere.</h2>
        <div className="companion-preview">
          <img src="/screenshot-1360.webp" alt="" width={1360} height={944} loading="lazy" />
        </div>
        <div className="companion-features">
          {companionFeatures.map((feature) => (
            <article key={feature.title}>
              <span>{feature.eyebrow}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="api-section">
        <div className="api-copy">
          <p className="marketing-eyebrow">API</p>
          <h2>Built to extend.</h2>
          <p>
            Sleevy exposes a REST API with personal API Keys, so your bookmark manager can accept links from
            scripts, shortcuts, tools, and automations.
          </p>
          <ul>
            <li>Personal API Keys for devices, scripts, and automations</li>
            <li>Simple JSON over HTTPS, no SDK required</li>
            <li>Capture, list, read state, and delete endpoints</li>
            <li>Rate-limited per API Key</li>
          </ul>
        </div>
        <div className="api-terminal" aria-label="API example">
          <div className="api-terminal-chrome">
            <div className="api-terminal-controls" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span className="api-terminal-title">~/sleeve - zsh</span>
            <div className="api-terminal-tabs" aria-label="API example format">
              {Object.keys(apiExamples).map((example) => (
                <button
                  aria-pressed={apiExample === example}
                  key={example}
                  onClick={() => setApiExample(example as keyof typeof apiExamples)}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
          <pre>
            <code>
              {apiExamples[apiExample]}
            </code>
          </pre>
        </div>
      </section>
    </>
  )
}
