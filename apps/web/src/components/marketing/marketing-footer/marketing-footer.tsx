import { Link } from "@tanstack/react-router"

import { BlueMeshGradient } from "../hero/blue-mesh-gradient"
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
          <Link to="/ios-app">iOS</Link>
          <Link to="/raycast">Raycast</Link>
          <Link to="/chrome-extension">Google Chrome</Link>
          <Link to="/inbox">Web Companion</Link>
        </nav>

        <nav className={styles.col} aria-label="Extras">
          <span className={styles.colTitle}>Extras</span>
          <Link to="/articles">Articles</Link>
          <Link to="/docs">Documentation</Link>
          <a href="https://github.com/Onnokh/sleevy" target="_blank" rel="noopener noreferrer">GitHub</a>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  )
}
