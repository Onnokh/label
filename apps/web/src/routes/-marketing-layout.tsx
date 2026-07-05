import { Outlet } from "@tanstack/react-router"
import { domAnimation, LazyMotion } from "motion/react"

import { MarketingNav } from "../components/marketing/marketing-nav/marketing-nav"
import { MarketingFooter } from "../components/marketing/marketing-footer/marketing-footer"
import styles from "./-marketing-layout.module.scss"

export function MarketingLayout() {
  return (
    <LazyMotion features={domAnimation}>
      <main className={styles.page}>
        <MarketingNav />
        <Outlet />
        <MarketingFooter />
      </main>
    </LazyMotion>
  )
}
