import { Link } from "@tanstack/react-router"

import styles from "./browser-section.module.scss"

export function BrowserSection() {
  return (
    <section className={styles.section} aria-labelledby="browser-title">
      <img className={styles.icon} src="/chrome-76.webp" alt="Google Chrome icon" width={76} height={82} loading="lazy" />
      <h2 id="browser-title">And it's in your browser too</h2>
      <p>One click in your toolbar saves the tab you're on. The full library opens in the web app.</p>
      <Link className={styles.link} to="/web-companion">View the web companion <span aria-hidden="true">→</span></Link>
      <div className={styles.frame}>
        <img
          src="/web-companion-1209.webp"
          srcSet="/web-companion-1209.webp 1x, /web-companion-2418.webp 2x"
          alt="Sleevy web app showing the inbox with saved links"
          width={1209}
          height={647}
          loading="lazy"
        />
      </div>
    </section>
  )
}
