import { Link } from "@tanstack/react-router"
import { Code2, FileText, KeyRound, Layers3, Search, TriangleAlert, WandSparkles } from "lucide-react"

import { DocsArticle } from "../../components/docs/docs-page"

import styles from "./docs-home-page.module.scss"

const toc = [
  { title: "Get started", url: "#get-started", depth: 2 },
  { title: "Build with the API", url: "#build-with-the-api", depth: 2 },
  { title: "API reference", url: "#api-reference", depth: 2 },
]

const groups = [
  {
    id: "get-started",
    title: "Get started",
    cards: [
      { title: "Getting started", description: "Create a key, save one URL, and read it back.", url: "/docs/getting-started", icon: FileText },
      { title: "Overview", description: "Understand the API model and the core capture flow.", url: "/docs/overview", icon: Layers3 },
    ],
  },
  {
    id: "build-with-the-api",
    title: "Build with the API",
    cards: [
      { title: "Captures and saved items", description: "Learn the resources behind your reading queue.", url: "/docs/concepts", icon: Layers3 },
      { title: "Save and organize links", description: "Compose practical workflows for saving and sorting links.", url: "/docs/guides", icon: WandSparkles },
    ],
  },
  {
    id: "api-reference",
    title: "API reference",
    cards: [
      { title: "Authentication", description: "Send API keys securely with bearer tokens.", url: "/docs/authentication", icon: KeyRound },
      { title: "Errors and rate limits", description: "Handle failures and pace requests safely.", url: "/docs/errors", icon: TriangleAlert },
      { title: "OpenAPI reference", description: "Browse every endpoint, field, and response.", url: "/docs/api-reference", icon: Code2 },
      { title: "Search the docs", description: "Jump to a page or endpoint with ⌘ K.", url: "/docs", icon: Search },
    ],
  },
] as const

export function DocsHomePage() {
  return (
    <DocsArticle title="Home" description="Everything you need to build a useful reading workflow with the Sleevy API." toc={toc}>
      <div className={styles.intro}>
        <p>Sleevy is a small, personal API for saving links from scripts, shortcuts, and tools you build.</p>
        <p>Follow the guided path below, or jump directly to the generated reference when you already know what you need.</p>
      </div>

      {groups.map((group) => (
        <section className={styles.section} key={group.id}>
          <h2 id={group.id}>{group.title}</h2>
          <div className={styles.grid}>
            {group.cards.map((card) => {
              const Icon = card.icon
              return (
                <Link className={styles.card} key={card.url} to={card.url}>
                  <Icon className={styles.icon} size={18} aria-hidden="true" />
                  <span className={styles.title}>{card.title}</span>
                  <span className={styles.description}>{card.description}</span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </DocsArticle>
  )
}
