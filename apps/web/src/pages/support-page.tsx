import styles from "./support-page.module.scss"

export function SupportPage() {
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <h1>Support</h1>
        <p>
          Need help with Sleevy? Email <a href="mailto:support@sleevy.app">support@sleevy.app</a>
          {" "}and include what you were trying to do, where you were using Sleevy, and what happened.
        </p>
        <span>We can help with sign-in, saving links, sync, account deletion, and privacy requests.</span>
      </header>
    </article>
  )
}
