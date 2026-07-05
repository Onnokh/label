import { Hero } from "../components/marketing/hero/hero"
import { UspSection } from "../components/marketing/usp-section/usp-section"
import { HighlightSection } from "../components/marketing/highlight-section/highlight-section"
import { ExtendSection } from "../components/marketing/extend-section/extend-section"
import { BrowserSection } from "../components/marketing/browser-section/browser-section"

export function HomePage() {
  return (
    <Hero>
      <UspSection />
      <HighlightSection />
      <ExtendSection />
      <BrowserSection />
    </Hero>
  )
}
