import styles from "./product-hunt-card.module.scss"

const productUrl = "https://www.producthunt.com/products/sleevy?embed=true&utm_source=embed&utm_medium=post_embed"
const thumbnailUrl =
  "https://ph-files.imgix.net/6a4f8d8a-41ff-46db-8ada-634d2f82f9ec.png?auto=compress,format&codec=mozjpeg&cs=strip&fit=crop&h=80&w=80"

/** Product Hunt launch card for the article pages. Temporary — remove after the launch. */
export function ProductHuntCard() {
  return (
    <aside className={styles.card} aria-label="Sleevy on Product Hunt">
      <div className={styles.head}>
        <img className={styles.thumb} src={thumbnailUrl} alt="" aria-hidden="true" width={64} height={64} loading="lazy" />
        <div className={styles.meta}>
          <h2>Sleevy</h2>
          <p>One tap to save. Read anywhere. Built to automate.</p>
        </div>
      </div>
      <a className={styles.action} href={productUrl} target="_blank" rel="noreferrer">
        Check it out on Product Hunt <span aria-hidden="true">→</span>
      </a>
    </aside>
  )
}
