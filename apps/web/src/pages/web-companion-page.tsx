import { Link } from "@tanstack/react-router"

import styles from "./web-companion-page.module.scss"

export function WebCompanionPage() {
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <h1>Your reading list on the web.</h1>
        <p>Open Sleevy in any browser to view and manage the same queue you use on iPhone, Chrome, Raycast, and through the API.</p>
        <Link className={styles.primaryAction} to="/inbox">Open Web Companion</Link>
      </header>

      <figure className={styles.productFrame}>
        <img
          src="/web-companion-1209.webp"
          srcSet="/web-companion-1209.webp 1x, /web-companion-2418.webp 2x"
          alt="Sleevy web companion showing an inbox of saved links"
          width={1209}
          height={647}
        />
      </figure>

      <div className={styles.content}>
        <p className={styles.intro}>The web companion is where all of those capture routes meet. It gives you a full view of the links in your account without tying the queue to one browser or device.</p>

        <section>
          <h2>Everything arrives in the same inbox</h2>
          <p>A link saved with the iPhone Share Sheet, Chrome extension, Raycast extension, or API appears in the same account. Open the web companion from another computer and the queue is already there.</p>
        </section>

        <section>
          <h2>Work through the queue from a keyboard</h2>
          <p>Open the original page, copy its URL, mark it read or unread, or remove it when it is no longer useful. The library can be sorted and filtered by folder, source, and tag.</p>
        </section>

        <p className={styles.captureLinks}>
          Ways to save: <Link to="/ios-app">iPhone</Link>, <Link to="/chrome-extension">Chrome</Link>, <Link to="/raycast">Raycast</Link>, or the <Link to="/docs">Sleevy API</Link>.
        </p>

        <section className={styles.closing}>
          <h2>Open your Sleevy inbox.</h2>
          <p>Sign in to view the reading queue connected to your Sleevy account.</p>
          <Link className={styles.primaryAction} to="/inbox">Open Web Companion</Link>
        </section>
      </div>
    </article>
  )
}
