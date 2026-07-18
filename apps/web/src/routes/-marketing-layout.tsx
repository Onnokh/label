import { Outlet, useLocation } from "@tanstack/react-router"
import { domAnimation, LazyMotion } from "motion/react"

import { MarketingNav } from "../components/marketing/marketing-nav/marketing-nav"
import { MarketingFooter } from "../components/marketing/marketing-footer/marketing-footer"
import { RybbitScript } from "../components/marketing/rybbit-script"
import styles from "./-marketing-layout.module.scss"

export function MarketingLayout() {
  const { pathname } = useLocation()
  const isDocs = pathname === "/docs" || pathname.startsWith("/docs/")

  return (
    <LazyMotion features={domAnimation}>
      <RybbitScript />
      {isDocs ? <Outlet /> : (
        <main className={styles.page}>
          <MarketingNav />
          <Outlet />
          <MarketingFooter />
        </main>
      )}
    </LazyMotion>
  )
}
