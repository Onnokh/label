import clsx from "clsx"

import styles from "./saved-card.module.scss"

// Varied title widths so the placeholder list reads as real content, not a grid.
const TITLE_WIDTHS = ["58%", "42%", "67%", "35%", "50%", "60%"]

function SavedCardSkeleton({ titleWidth }: { readonly titleWidth: string }) {
  return (
    <div className={clsx(styles.row, styles.skeletonRow)} aria-hidden="true">
      <div className={styles.link}>
        <div className={clsx(styles.skeleton, styles.skeletonFavicon)} />
        <div className={styles.body}>
          <div className={clsx(styles.skeleton, styles.skeletonTitle)} style={{ width: titleWidth }} />
          <div className={clsx(styles.skeleton, styles.skeletonHost)} />
        </div>
        <div className={clsx(styles.skeleton, styles.skeletonDate)} />
      </div>
    </div>
  )
}

export function SavedListSkeleton({ rows = 6 }: { readonly rows?: number }) {
  return (
    <ul className="item-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <li key={index}>
          <SavedCardSkeleton titleWidth={TITLE_WIDTHS[index % TITLE_WIDTHS.length]} />
        </li>
      ))}
    </ul>
  )
}
