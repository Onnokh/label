import styles from "./browser-section.module.scss"

export function BrowserSection() {
  return (
    <section className={styles.section} aria-labelledby="browser-title">
      <img className={styles.icon} src="/chrome-76.webp" alt="" width={76} height={82} loading="lazy" />
      <h2 id="browser-title">And it's in your browser too</h2>
      <p>One click in your toolbar saves the tab you're on. The full library opens in the web app.</p>
      <div className={styles.frame}>
        <img
          className={styles.shotGlow}
          src="/web-companion-1087.webp"
          alt=""
          aria-hidden="true"
          width={1087}
          height={576}
          loading="lazy"
        />
        <img
          className={styles.shot}
          src="/web-companion-1087.webp"
          alt="Sleevy web app showing the inbox with saved links"
          width={1087}
          height={576}
          loading="lazy"
        />
      </div>
    </section>
  )
}
