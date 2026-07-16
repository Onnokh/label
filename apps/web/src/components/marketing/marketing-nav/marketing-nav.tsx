import { useState } from "react"
import { Link } from "@tanstack/react-router"
import clsx from "clsx"

import { authClient } from "../../../auth"
import { appStoreUrl } from "../store-links"
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
              <Link className={styles.link} to="/ios-app" onClick={closeMenu}>iOS</Link>
              <Link className={styles.link} to="/raycast" onClick={closeMenu}>Raycast</Link>
              <Link className={styles.link} to="/chrome-extension" onClick={closeMenu}>Google Chrome</Link>
              <Link className={styles.link} to="/articles" onClick={closeMenu}>Articles</Link>
              <Link className={styles.link} to="/docs" onClick={closeMenu}>Docs</Link>
              <a
                className={clsx(styles.link, styles.iconLink)}
                href="https://github.com/Onnokh/sleevy"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Sleevy on GitHub"
                onClick={closeMenu}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.78.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.16-.28-.16-.68-.56-.01-.57.63-.01 1.08.59 1.23.84.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.09-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.43 7.43 0 0 1 8 3.94c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.14-1.87 3.83-3.65 4.04.29.25.54.75.54 1.52 0 1.09-.01 1.98-.01 2.25 0 .22.15.48.55.4A8.14 8.14 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z" />
                </svg>
              </a>
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
