import type { ReactNode } from "react"

import styles from "./page-toolbar.module.scss"

type PageToolbarProps = {
  // Filters and sorts, read left to right.
  readonly children: ReactNode
  // Page actions, set apart from the controls that only narrow the list.
  readonly actions?: ReactNode
}

export function PageToolbar({ children, actions }: PageToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.controls}>{children}</div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  )
}
