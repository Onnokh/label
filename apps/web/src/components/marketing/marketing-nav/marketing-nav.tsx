import { Link } from "@tanstack/react-router"

import { authClient } from "../../../auth"
import styles from "./marketing-nav.module.scss"

export function MarketingNav() {
  const { data: session } = authClient.useSession()
  const appButtonLabel = session ? "Companion" : "Login"

  return (
    <nav className={styles.nav} aria-label="Primary">
      <Link className={styles.brand} to="/" aria-label="Sleevy home">
        <span className={styles.logo}>
          <img className={styles.logoMark} src="/logo-mark.svg" alt="" height={28} />
          <span className={styles.logoText}>Sleevy</span>
        </span>
      </Link>
      <div className={styles.actions}>
        {/* TODO: Demo is a placeholder — no destination yet */}
        <a className={styles.link} href="#" aria-disabled="true">Demo</a>
        <Link className={styles.login} to="/inbox">
          <img className={styles.loginIcon} src="/logo-mark-color.png" alt="" height={20} />
          {appButtonLabel}
        </Link>
      </div>
    </nav>
  )
}
