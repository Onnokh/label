import { Link } from "@tanstack/react-router"

import styles from "./marketing-footer.module.scss"

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <img className={styles.bg} src="/footer-glow.webp" alt="" aria-hidden="true" />
      <div className={styles.inner}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <img src="/logo-mark-white.svg" alt="" width={22} height={34} />
            <span>Sleevy</span>
          </div>
          <p>
            A scriptable bookmark manager app for saving links, keeping your reading list in sync, and coming
            back when you are ready.
          </p>
        </div>

        <nav className={styles.col} aria-label="Integrations">
          <span className={styles.colTitle}>Integrations</span>
          <a href="https://www.raycast.com/onnokh/sleevy">Raycast Extension</a>
          <a href="https://chromewebstore.google.com/detail/sleevy/ogffdakffimomfahfpihfmgdaincemjj">Chrome Extension</a>
          <Link to="/inbox">Web Companion</Link>
        </nav>

        <nav className={styles.col} aria-label="Extras">
          <span className={styles.colTitle}>Extras</span>
          <Link to="/docs">Documentation</Link>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  )
}
