import { Hero } from "../components/marketing/hero/hero"
import { UspSection } from "../components/marketing/usp-section/usp-section"
import { HighlightSection } from "../components/marketing/highlight-section/highlight-section"
import { ExtendSection } from "../components/marketing/extend-section/extend-section"
import { BrowserSection } from "../components/marketing/browser-section/browser-section"
import { StructuredData } from "../components/marketing/structured-data"

const homePageStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://sleevy.app/#organization",
      name: "Sleevy",
      url: "https://sleevy.app/",
      logo: {
        "@type": "ImageObject",
        url: "https://sleevy.app/app-icon-160.webp",
        width: 160,
        height: 160,
      },
      sameAs: ["https://github.com/Onnokh/sleevy"],
    },
    {
      "@type": "WebSite",
      "@id": "https://sleevy.app/#website",
      url: "https://sleevy.app/",
      name: "Sleevy",
      publisher: { "@id": "https://sleevy.app/#organization" },
      inLanguage: "en",
    },
  ],
}

export function HomePage() {
  return (
    <>
      <StructuredData data={homePageStructuredData} />
      <Hero>
        <UspSection />
        <HighlightSection />
        <ExtendSection />
        <BrowserSection />
      </Hero>
    </>
  )
}
