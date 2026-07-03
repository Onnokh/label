import { Link } from "@tanstack/react-router"

import { ExtendMarqueeRow } from "./extend-marquee-row"
import styles from "./extend-section.module.scss"

export function ExtendSection() {
  return (
    <section className={styles.section} aria-labelledby="extend-title">
      <img className={styles.glow} src="/page-glow.webp" alt="" aria-hidden="true" />
      <h2 className={styles.title} id="extend-title">
        Built to extend.
      </h2>
      <div className={styles.marquee} aria-hidden="true">
        <ExtendMarqueeRow baseVelocity={-2} />
        <ExtendMarqueeRow baseVelocity={2} offset />
      </div>
      <div className={styles.body}>
        <p>
          Sleevy exposes a capture API with personal access tokens. Anything that can make an HTTP request
          can save to your queue, from scripts and CLI tools to automations and whatever you build next.
        </p>
        <ul>
          <li>Personal tokens with scoped permissions per device or script</li>
          <li>Simple JSON over HTTPS, no SDK required</li>
          <li>Webhooks for archive, tag, and read events</li>
          <li>Rate-limited per token</li>
        </ul>
      </div>
      <div className={styles.footer}>
        <Link to="/docs">
          Take me to the docs
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M9 13L14 8L9 3M14 8H2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </section>
  )
}
