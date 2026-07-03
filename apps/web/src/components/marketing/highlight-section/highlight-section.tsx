import clsx from "clsx"

import { appStoreUrl, raycastStoreUrl } from "../store-links"
import styles from "./highlight-section.module.scss"

export function HighlightSection() {
  return (
    <section className={styles.section} aria-label="Sleevy on every surface">
      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={clsx(styles.frame, styles.frameShare)}>
            <h3>Native Share</h3>
            <p>Hit share in any app, pick Sleevy, and the link is saved. Nothing to copy or paste.</p>
            <img
              className={clsx(styles.shot, styles.shotShare)}
              src="/share-sheet-750.webp"
              alt="iOS share sheet with Sleevy selected"
              width={750}
              height={906}
              loading="lazy"
            />
          </div>
          <img className={styles.icon} src="/ios26-82.webp" alt="" width={82} height={82} loading="lazy" />
          <a className={styles.cta} href={appStoreUrl}>
            <img src="/appstore-glyph-96.webp" alt="" width={96} height={96} loading="lazy" />
            Install on your iPhone
          </a>
        </article>
        <article className={styles.card}>
          <div className={clsx(styles.frame, styles.frameRaycast)}>
            <h3>In your workflow</h3>
            <p>Capture and search from Raycast without leaving the keyboard.</p>
            <img
              className={clsx(styles.shot, styles.shotRaycast)}
              src="/raycast-search-1508.webp"
              alt="Searching saved items from Raycast"
              width={1508}
              height={958}
              loading="lazy"
            />
          </div>
          <img
            className={clsx(styles.icon, styles.iconRaycast)}
            src="/raycast-82.webp"
            alt=""
            width={82}
            height={82}
            loading="lazy"
          />
          <a className={clsx(styles.cta, styles.ctaRaycast)} href={raycastStoreUrl}>
            <img src="/raycast-82.webp" alt="" width={82} height={82} loading="lazy" />
            Add to your Raycast
          </a>
        </article>
      </div>
    </section>
  )
}
