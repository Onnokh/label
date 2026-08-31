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
            <img src="/logo-mark-white.svg" alt="Sleevy logo" width={27} height={34} />
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
          <Link to="/raycast">Raycast extension</Link>
          <Link to="/chrome-extension">Chrome read-later extension</Link>
          <Link to="/web-companion">Web Companion</Link>
        </nav>

        <nav className={styles.col} aria-label="Extras">
          <span className={styles.colTitle}>Extras</span>
          <Link to="/articles">Articles</Link>
          <Link to="/docs/$" params={{ _splat: "" }}>Sleevy API documentation</Link>
          <a href="https://github.com/Onnokh/sleevy" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a
            className={styles.smallLink}
            href="https://indiehunt.io/project/sleevy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Featured on IndieHunt
          </a>
          <Link to="/support">Support</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  )
}
