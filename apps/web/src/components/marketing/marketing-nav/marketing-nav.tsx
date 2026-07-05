import { useState } from "react"
import { Link } from "@tanstack/react-router"
import clsx from "clsx"

import { authClient } from "../../../auth"
import { appStoreUrl, chromeStoreUrl, raycastStoreUrl } from "../store-links"
import styles from "./marketing-nav.module.scss"

export function MarketingNav() {
  const { data: session } = authClient.useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  const userInitial = session?.user.name.trim().charAt(0).toUpperCase() || session?.user.email.charAt(0).toUpperCase()

  return (
    <div className={clsx(styles.container, menuOpen && styles.menuOpened)}>
      <nav className={styles.navbar} aria-label="Primary">
        <div className={styles.logoRow}>
          <Link className={styles.brand} to="/" aria-label="Sleevy home" onClick={closeMenu}>
            <img className={styles.logoMark} src="/logo-mark.svg" alt="" width={19} height={28} />
            <span className={styles.logoText}>Sleevy</span>
          </Link>
          <button
            className={styles.toggle}
            type="button"
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className={styles.toggleLine} />
            <span className={styles.toggleLine} />
            <span className={styles.toggleLine} />
          </button>
        </div>
        <div className={styles.menu}>
          <div className={styles.menuInner}>
            <div className={styles.navigation}>
              <a className={styles.link} href={raycastStoreUrl} target="_blank" rel="noreferrer" onClick={closeMenu}>Raycast Extension</a>
              <a className={styles.link} href={chromeStoreUrl} target="_blank" rel="noreferrer" onClick={closeMenu}>Chrome Extension</a>
              <Link className={styles.link} to="/docs" onClick={closeMenu}>Docs</Link>
            </div>
            <div className={styles.secondary}>
              {session ? (
                <Link className={styles.download} to="/inbox" onClick={closeMenu}>
                  {session.user.image ? (
                    <img className={styles.avatar} src={session.user.image} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className={styles.avatarFallback} aria-hidden="true">{userInitial}</span>
                  )}
                  My Sleevy
                </Link>
              ) : (
                <>
                  <Link className={styles.link} to="/inbox" onClick={closeMenu}>Login</Link>
                  <a className={styles.download} href={appStoreUrl} onClick={closeMenu}>
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path fill="currentColor" d="M12.665 15.358c-.905.844-1.893.711-2.843.311-1.006-.409-1.93-.427-2.991 0-1.33.551-2.03.391-2.825-.31C-.498 10.886.166 4.078 5.28 3.83c1.246.062 2.114.657 2.843.71 1.09-.213 2.133-.826 3.296-.746 1.393.107 2.446.64 3.138 1.6-2.88 1.662-2.197 5.315.443 6.337-.526 1.333-1.21 2.657-2.345 3.635zM8.03 3.778C7.892 1.794 9.563.16 11.483 0c.268 2.293-2.16 4-3.452 3.777" />
                    </svg>
                    Download
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    </div>
  )
}
