import styles from "./privacy-page.module.scss"

const sections = [
  {
    title: "Account",
    body: [
      "Sleevy stores the account information needed to sign you in, such as your name, email address, profile image when provided, sign-in provider, sessions, and API keys.",
      "We use account data to authenticate you, secure your sessions, support integrations, and let you delete your account from Settings.",
    ],
  },
  {
    title: "Library",
    body: [
      "Sleevy stores the links you save and the details needed to make them useful: URL, title, description, site name, favicon, image, read state, tags, source, and timestamps.",
      "We use library data to sync your reading list across the web companion, iOS app, share extension, browser extension, Raycast extension, and API.",
    ],
  },
  {
    title: "Enrichment",
    body: [
      "Sleevy fetches link-level metadata and may use an AI provider to generate short preview summaries and suggested tags from link-level information such as URL, host, title, description, and site name.",
      "Enrichment is stored for the link, not directly on your account. We do not send your account details as part of enrichment requests.",
    ],
  },
  {
    title: "Services",
    body: [
      "Sleevy uses service providers for hosting, storage, Google and Apple sign-in, analytics, page metadata fetching, and AI enrichment. These providers process information only as needed to provide Sleevy.",
      "Sleevy uses HTTPS and limits access to personal information to what is needed to operate, secure, and support the service.",
      "We may use basic product analytics and operational logs to understand whether Sleevy is working and where it needs attention. Sleevy does not sell your personal information or use your saved links for third-party advertising.",
    ],
  },
  {
    title: "Deletion",
    body: [
      "You can delete saved items individually. You can also delete your account from Settings, which removes your account and the saved-item records connected to it.",
      "Link metadata and enrichment are stored at the link level. If the same link is saved by another user, non-account link metadata may remain after your account is deleted.",
    ],
  },
]

const highlights = [
  {
    title: "Account",
    body: "Name, email, sign-in provider, sessions, and API keys.",
  },
  {
    title: "Library",
    body: "Links you save, read state, tags, source, and timestamps.",
  },
  {
    title: "Enrichment",
    body: "Link-level metadata, summaries, and suggested tags.",
  },
]

export function PrivacyPage() {
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <h1>Simple by design.</h1>
        <p>
          Sleevy saves the links you choose to keep, enriches them so they are easier to find later,
          and keeps your reading list synced across the places you use it.
        </p>
        <span>Last updated May 15, 2026</span>
      </header>

      <section className={styles.summary} aria-label="Privacy summary">
        {highlights.map((highlight) => (
          <div key={highlight.title}>
            <h2>{highlight.title}</h2>
            <p>{highlight.body}</p>
          </div>
        ))}
      </section>

      <div className={styles.sections}>
        {sections.map((section) => (
          <section className={styles.section} key={section.title}>
            <h2>{section.title}</h2>
            <div className={styles.sectionBody}>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className={styles.contact}>
        For privacy questions, data requests, or deletion help, contact <a href="mailto:privacy@sleevy.app">privacy@sleevy.app</a>.
      </p>
    </article>
  )
}
