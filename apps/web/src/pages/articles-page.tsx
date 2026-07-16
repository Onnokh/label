import { Link } from "@tanstack/react-router"

import styles from "./articles-page.module.scss"

const articles = [
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
