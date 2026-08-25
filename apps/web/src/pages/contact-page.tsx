import { StructuredData } from "../components/marketing/structured-data"
import styles from "./support-page.module.scss"

const contactStructuredData = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  "@id": "https://sleevy.app/contact#page",
  name: "Contact Sleevy",
  url: "https://sleevy.app/contact",
  description:
    "How to reach Sleevy: support, privacy and data requests, security reports, and developer questions about the API and MCP server.",
  mainEntity: { "@id": "https://sleevy.app/#organization" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Sleevy", item: "https://sleevy.app/" },
      { "@type": "ListItem", position: 2, name: "Contact", item: "https://sleevy.app/contact" },
    ],
  },
}

export function ContactPage() {
  return (
    <article className={styles.page}>
      <StructuredData data={contactStructuredData} />
      <header className={styles.hero}>
        <h1>Contact</h1>
        <p>
          Every address below reaches a person. Sleevy is independently built, so there is
          no ticket queue to get lost in — but there is also no overnight shift, so expect a
          reply within a few working days.
        </p>
      </header>

      <section>
        <h2>Help with the app</h2>
        <p>
          Email <a href="mailto:support@sleevy.app">support@sleevy.app</a> for anything to do
          with using Sleevy: signing in, saving links, sync between devices, folders, or
          deleting your account.
        </p>
        <p>
          It helps enormously to include three things: what you were trying to do, where you
          were doing it (iPhone app, Chrome extension, Raycast, the web, or the API), and
          what actually happened instead. If a specific link failed to save, send the URL.
          The <a href="/support">support page</a> covers the common cases.
        </p>
      </section>

      <section>
        <h2>Privacy and data requests</h2>
        <p>
          Email <a href="mailto:privacy@sleevy.app">privacy@sleevy.app</a> to ask what is
          stored about you, to request a copy, or to have your data deleted. You can also
          delete your account and its data yourself from settings at any time. The{" "}
          <a href="/privacy">privacy policy</a> explains what is kept and why.
        </p>
      </section>

      <section>
        <h2>Security reports</h2>
        <p>
          If you have found a vulnerability, email{" "}
          <a href="mailto:support@sleevy.app">support@sleevy.app</a> with{" "}
          <strong>SECURITY</strong> in the subject line and enough detail to reproduce it,
          and please give it a chance to be fixed before publishing. Reports are welcome and
          taken seriously.
        </p>
      </section>

      <section>
        <h2>Building against the API</h2>
        <p>
          Start with the <a href="/docs">developer documentation</a>, the{" "}
          <a href="/openapi.json">OpenAPI description</a>, and the{" "}
          <a href="/docs/mcp">MCP guide</a>. If you are wiring up an agent, the{" "}
          <a href="/auth.md">authentication walkthrough</a> covers getting and revoking a
          credential. Questions the docs do not answer go to{" "}
          <a href="mailto:support@sleevy.app">support@sleevy.app</a>.
        </p>
      </section>
    </article>
  )
}
