import { Link } from "@tanstack/react-router"

import { BlueMeshGradient } from "../hero/blue-mesh-gradient"
import { chromeStoreUrl, raycastStoreUrl } from "../store-links"
import styles from "./marketing-footer.module.scss"

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <BlueMeshGradient variant="footer" />
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
          <a href={raycastStoreUrl} target="_blank" rel="noreferrer">Raycast Extension</a>
          <a href={chromeStoreUrl} target="_blank" rel="noreferrer">Chrome Extension</a>
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
