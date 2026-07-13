import clsx from "clsx"

import { GlassPill } from "../glass-pill/glass-pill"
import { BlueMeshGradient } from "../hero/blue-mesh-gradient"
import { appStoreUrl, raycastDeeplink } from "../store-links"
import styles from "./highlight-section.module.scss"

/* Straddle the frame's bottom edge, as the old .cta did. Inline because
   GlassPill positioning can't come from a class (see glass-pill.tsx). */
/* Progressive blur band at the frame's bottom edge (see .fade in the module). */
function BlurFade() {
  return (
    <div className={styles.fade} aria-hidden="true">
      <div className={styles.fadeLayer} />
      <div className={styles.fadeLayer} />
      <div className={styles.fadeLayer} />
      <div className={styles.fadeLayer} />
      <div className={styles.fadeLayer} />
    </div>
  )
}

const ctaGlassPosition = {
  position: "absolute",
  bottom: 0,
  left: "50%",
  transform: "translate(-50%, 50%)",
} as const

export function HighlightSection() {
  return (
    <section className={styles.section} aria-label="Sleevy on every surface">
      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={clsx(styles.frame, styles.frameShare)}>
            <BlueMeshGradient variant="share" />
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
            <BlurFade />
          </div>
          <img className={styles.icon} src="/ios26-82.webp" alt="" width={82} height={82} loading="lazy" />
          <GlassPill radius={28} style={ctaGlassPosition}>
            <a className={styles.cta} href={appStoreUrl}>
              <img src="/appstore-glyph-96.webp" alt="" width={96} height={96} loading="lazy" />
              Install on your iPhone
            </a>
          </GlassPill>
        </article>
        <article className={styles.card}>
          <div className={clsx(styles.frame, styles.frameRaycast)}>
            <BlueMeshGradient variant="workflow" />
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
            <BlurFade />
          </div>
          <img
            className={clsx(styles.icon, styles.iconRaycast)}
            src="/raycast-82.webp"
            alt=""
            width={82}
            height={82}
            loading="lazy"
          />
          <GlassPill radius={28} style={ctaGlassPosition}>
            <a className={clsx(styles.cta, styles.ctaRaycast)} href={raycastDeeplink}>
              <img src="/raycast-82.webp" alt="" width={82} height={82} loading="lazy" />
              Add to your Raycast
            </a>
          </GlassPill>
        </article>
      </div>
    </section>
  )
}
