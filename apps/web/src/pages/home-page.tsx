import { Hero } from "../components/marketing/hero/hero"
import { UspSection } from "../components/marketing/usp-section/usp-section"
import { HighlightSection } from "../components/marketing/highlight-section/highlight-section"
import { ExtendSection } from "../components/marketing/extend-section/extend-section"
import { BrowserSection } from "../components/marketing/browser-section/browser-section"
import { StructuredData } from "../components/marketing/structured-data"
import { appStoreUrl } from "../components/marketing/store-links"

// The entity graph an agent reads to answer "what is Sleevy, who runs it, what
// does it do, and how do I reach it" without scraping the page.
//
// Every claim here is one the site can back: the sameAs profiles exist, the
// contact addresses are the ones the support and privacy pages publish, and the
// FAQ answers match what the documentation says. No postal address is stated
// because Sleevy does not publish one.
const homePageStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://sleevy.app/#organization",
      name: "Sleevy",
      description:
        "Sleevy builds a native-first read-later app with a scriptable REST API and an MCP server for AI agents.",
      url: "https://sleevy.app/",
      logo: {
        "@type": "ImageObject",
        url: "https://sleevy.app/app-icon-160.webp",
        width: 160,
        height: 160,
      },
      image: "https://sleevy.app/app-630.webp",
      email: "support@sleevy.app",
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "support@sleevy.app",
          url: "https://sleevy.app/support",
          availableLanguage: ["English"],
        },
        {
          "@type": "ContactPoint",
          contactType: "privacy",
          email: "privacy@sleevy.app",
          url: "https://sleevy.app/privacy",
          availableLanguage: ["English"],
        },
        {
          "@type": "ContactPoint",
          contactType: "technical support",
          url: "https://sleevy.app/docs",
          availableLanguage: ["English"],
        },
      ],
      sameAs: [
        "https://github.com/Onnokh/sleevy",
        appStoreUrl,
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://sleevy.app/#website",
      url: "https://sleevy.app/",
      name: "Sleevy",
      description:
        "Save any link to one synced reading queue, from iPhone, Chrome, Raycast, the web, your own scripts, or an AI agent.",
      publisher: { "@id": "https://sleevy.app/#organization" },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://sleevy.app/#app",
      name: "Sleevy",
      description:
        "A native-first read-later app. Save any URL to one synced queue and return to it from iPhone, Chrome, Raycast, the web, a script, or an AI agent. Includes a REST API and an MCP server.",
      url: "https://sleevy.app/",
      applicationCategory: "ProductivityApplication",
      operatingSystem: "iOS, Web, macOS",
      image: "https://sleevy.app/app-630.webp",
      screenshot: "https://sleevy.app/app-630.webp",
      softwareVersion: "1.0",
      publisher: { "@id": "https://sleevy.app/#organization" },
      featureList: [
        "Save any link from iPhone, Chrome, Raycast, or the web",
        "One reading queue synced across every client",
        "Organize saved links into folders and tags",
        "REST API with OpenAPI 3.1 for scripts and automations",
        "MCP server so AI agents can save and organize links",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        url: "https://sleevy.app/",
      },
      downloadUrl: appStoreUrl,
      sameAs: appStoreUrl,
    },
    {
      "@type": "Service",
      "@id": "https://sleevy.app/#api",
      name: "Sleevy API and MCP server",
      description:
        "A REST API and a Model Context Protocol server for saving links and managing a read-later queue programmatically.",
      url: "https://sleevy.app/docs",
      provider: { "@id": "https://sleevy.app/#organization" },
      serviceType: "Developer API",
      termsOfService: "https://sleevy.app/privacy",
      availableChannel: {
        "@type": "ServiceChannel",
        serviceUrl: "https://api.sleevy.app",
        name: "Sleevy REST API",
        serviceLocation: { "@id": "https://sleevy.app/#organization" },
      },
    },
    {
      "@type": "FAQPage",
      "@id": "https://sleevy.app/#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Sleevy?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sleevy is a native-first read-later app. You save a link once and return to the same synced reading queue from an iPhone app, a Chrome extension, a Raycast extension, the web, your own scripts, or an AI agent.",
          },
        },
        {
          "@type": "Question",
          name: "Does Sleevy have an API?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Sleevy exposes a versioned REST API at https://api.sleevy.app described by an OpenAPI 3.1 document at https://sleevy.app/openapi.json. You authenticate with a personal API key created in settings, or with OAuth 2.1. Writes accept an Idempotency-Key so a retry cannot duplicate a save.",
          },
        },
        {
          "@type": "Question",
          name: "Can an AI agent use Sleevy?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Sleevy runs a Model Context Protocol server over Streamable HTTP at https://api.sleevy.app/mcp. An MCP client discovers the authorization server, registers itself, and asks the person to approve scopes. The agent can then save links, list the queue, manage read state, and organize folders.",
          },
        },
        {
          "@type": "Question",
          name: "How do I get an API key for Sleevy?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sign in at https://sleevy.app, open Settings, and create a scoped personal API key under API Keys. It is immediate and self-serve; there is no sales contact and no approval queue. Send it as an Authorization: Bearer header.",
          },
        },
        {
          "@type": "Question",
          name: "Is Sleevy free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Sleevy is free to use, including the REST API and the MCP server.",
          },
        },
      ],
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
