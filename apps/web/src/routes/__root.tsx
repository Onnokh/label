/// <reference types="vite/client" />
import { createRootRoute } from "@tanstack/react-router"
import { RootComponent } from "./-root-component"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: "Sleevy is a scriptable bookmark manager app with an API for saving links from iOS, Raycast, Chrome, the web, scripts, and automations." },
      { title: "Sleevy - Scriptable Bookmark Manager App" },
      { property: "og:site_name", content: "Sleevy" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  component: RootComponent,
})
