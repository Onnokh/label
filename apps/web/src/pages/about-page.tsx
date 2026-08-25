import { StructuredData } from "../components/marketing/structured-data"
import styles from "./support-page.module.scss"

const aboutStructuredData = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": "https://sleevy.app/about#page",
  name: "About Sleevy",
  url: "https://sleevy.app/about",
  description:
    "What Sleevy is, who it is for, and how it is built: a native-first read-later app with a scriptable REST API and an MCP server.",
  mainEntity: { "@id": "https://sleevy.app/#organization" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Sleevy", item: "https://sleevy.app/" },
      { "@type": "ListItem", position: 2, name: "About", item: "https://sleevy.app/about" },
    ],
  },
}

export function AboutPage() {
  return (
    <article className={styles.page}>
      <StructuredData data={aboutStructuredData} />
      <header className={styles.hero}>
        <h1>About Sleevy</h1>
        <p>
          Sleevy is a read-later app. You save a link once, and it turns up in the same
          queue whether you open your iPhone, your browser, Raycast, or a script you wrote
          yourself.
        </p>
      </header>

      <section>
        <h2>Why it exists</h2>
        <p>
          Most reading lists ask you to file a link before you have read it. You are asked
          to pick a folder, add tags, and decide what the thing is for — at the exact moment
          you have the least idea, because you have not read it yet. So the link goes in an
          open tab instead, and the tab stays open for a month.
        </p>
        <p>
          Sleevy takes the link first and asks questions later. Saving is one action from
          wherever you are. Titles, images, and a short summary are fetched in the
          background, so an item that arrived as a bare URL has something to recognise it by
          when you come back to it. Folders and tags are there when you want them, and
          ignoring them entirely is a perfectly good way to use the app.
        </p>
      </section>

      <section>
        <h2>Built to be driven by other software</h2>
        <p>
          Everything the apps can do is available over a documented REST API. There is an
          OpenAPI 3.1 description, an API key you can create yourself in settings without
          talking to anyone, idempotent writes so a retry cannot save the same link twice,
          and cursor-based paging for walking a long queue.
        </p>
        <p>
          Sleevy also runs a Model Context Protocol server, so an AI assistant can save a
          link for you, tell you what is in your queue, mark something read, or tidy your
          folders — with your permission, scoped to exactly what you approved, and revocable
          at any time from the same settings screen.
        </p>
      </section>

      <section>
        <h2>How it treats your data</h2>
        <p>
          Your queue is yours. Sleevy stores the links you save and the metadata it fetches
          about them; it does not sell that, and it does not need it for anything except
          showing you your own reading list. A profile is private until you deliberately
          publish a folder to it. You can delete your account, and the data with it, from
          settings. The <a href="/privacy">privacy policy</a> says all of this in more
          detail.
        </p>
      </section>

      <section>
        <h2>Get in touch</h2>
        <p>
          Sleevy is a small, independently built product. Questions, bug reports, and
          feature requests all reach a person: see the <a href="/contact">contact page</a>,
          or read the <a href="/docs">developer documentation</a> if you are here to build
          something against the API.
        </p>
      </section>
    </article>
  )
}
