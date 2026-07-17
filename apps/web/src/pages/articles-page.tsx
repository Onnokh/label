import { Link } from "@tanstack/react-router"

import { StructuredData } from "../components/marketing/structured-data"

import styles from "./articles-page.module.scss"

const articles = [
  {
    href: "/articles/save-links-with-raycast",
    title: "How to save links with Raycast.",
    description: "Use Raycast to save a URL from your clipboard, search your read-later queue, and reopen saved links without leaving the launcher.",
    dateTime: "2026-07-16",
    date: "July 16, 2026",
    topic: "Raycast read later",
  },
  {
    href: "/articles/read-later-app-chrome-iphone",
    title: "A read-later app for Chrome and iPhone.",
    description: "Save links from Chrome and iPhone to the same synced reading queue, then return to them from either device.",
    dateTime: "2026-07-16",
    date: "July 16, 2026",
    topic: "Cross-device read later",
  },
  {
    href: "/articles/read-later-api",
    title: "Save URLs with a read-later API.",
    description: "Send links to a personal reading queue from scripts, shortcuts, command-line tools, and your own automations.",
    dateTime: "2026-07-16",
    date: "July 16, 2026",
    topic: "Read-later API",
  },
  {
    href: "/pocket-alternative",
    title: "A simpler home for the links you mean to return to.",
    description: "Looking for a Pocket alternative? Compare a read-later app for saving links from iPhone, Chrome, Raycast, and scripts in one synced queue.",
    dateTime: "2026-07-16",
    date: "July 16, 2026",
    topic: "Pocket alternative",
  },
] as const

export function ArticlesPage() {
  return (
    <article className={styles.page}>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": "https://sleevy.app/articles#collection",
          url: "https://sleevy.app/articles",
          name: "Sleevy articles",
          description: "Articles about saving links from iPhone, Chrome, Raycast, and personal automations.",
          isPartOf: { "@id": "https://sleevy.app/#website" },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: articles.map((article, index) => ({
              "@type": "ListItem",
              position: index + 1,
              url: new URL(article.href, "https://sleevy.app").href,
              name: article.title,
            })),
          },
        }}
      />
      <header className={styles.hero}>
        <h1>Articles</h1>
      </header>

      <section className={styles.list} aria-label="Articles">
        {articles.map((article) => (
          <Link key={article.href} className={styles.card} to={article.href}>
            <span className={styles.topic}>{article.topic}</span>
            <h2>{article.title}</h2>
            <p>{article.description}</p>
            <time dateTime={article.dateTime}>{article.date}</time>
            <span className={styles.readMore}>Read article <span aria-hidden="true">→</span></span>
          </Link>
        ))}
      </section>
    </article>
  )
}
