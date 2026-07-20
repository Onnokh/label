import { Link } from "@tanstack/react-router"

import { ExtendMarqueeRow } from "./extend-marquee-row"
import styles from "./extend-section.module.scss"

export function ExtendSection() {
  return (
    <section className={styles.section} aria-labelledby="extend-title">
      <div className={styles.glow} aria-hidden="true" />
      <h2 className={styles.title} id="extend-title">
        Built to extend.
      </h2>
      <div className={styles.marquee} aria-hidden="true">
        <ExtendMarqueeRow baseVelocity={-2} />
        <ExtendMarqueeRow baseVelocity={2} offset />
      </div>
      <div className={styles.body}>
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Build on the API</h3>
          <p>
            Sleevy exposes a capture API with personal access tokens. Anything that can make an HTTP request
            can save to your queue, from scripts and CLI tools to automations.
          </p>
          <ul>
            <li>Personal tokens with scoped permissions per device or script</li>
            <li>Simple JSON over HTTPS, no SDK required</li>
            <li>Webhooks for archive, tag, and read events</li>
            <li>Rate-limited per token</li>
          </ul>
        </div>
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>MCP for agents</h3>
          <p>
            Sleevy runs an MCP server, so agents can work your queue over the Model Context Protocol, right
            in the flow of a conversation.
          </p>
          <ul>
            <li>Save, find, and organize saved items</li>
            <li>Create and manage folders</li>
            <li>OAuth sign-in with scoped permissions</li>
            <li>Works with any MCP client</li>
          </ul>
        </div>
      </div>
      <div className={styles.footer}>
        <Link to="/docs/$" params={{ _splat: "" }}>
          Take me to the docs
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M9 13L14 8L9 3M14 8H2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <Link to="/docs/$" params={{ _splat: "mcp" }}>
          Connect an AI agent
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M9 13L14 8L9 3M14 8H2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </section>
  )
}
