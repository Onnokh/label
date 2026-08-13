import { createFileRoute } from "@tanstack/react-router"

import {
  profileSitemapUrl,
  renderSitemap,
  staticSitemapUrls,
} from "../lib/sitemap"
import { fetchIndexableProfiles } from "../sleevy/public-profile"

// The sitemap robots.txt names. It replaces the former static
// public/sitemap.xml, which could not list Public Profiles: those appear and
// disappear as Accounts turn Profile Visibility on and off. The fixed URLs the
// static file held are folded in from src/lib/sitemap.ts, so this one document
// still carries them.

// A sitemap that fails is worse than one missing the Public Profiles: a crawler
// that gets a 500 learns nothing about the site at all. So the API is allowed to
// be unreachable, and the fixed URLs are served on their own when it is.
const sitemapUrls = async () => {
  try {
    const profiles = await fetchIndexableProfiles()
    return [...staticSitemapUrls, ...profiles.map(profileSitemapUrl)]
  } catch (error) {
    console.error("sitemap: listing indexable Public Profiles failed", error)
    return staticSitemapUrls
  }
}

// The file name escapes the dot as `[.]`, so this route is served at
// /sitemap.xml. The path argument is left out and filled in by the route
// generator, because src/routeTree.gen.ts does not name this route yet.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(renderSitemap(await sitemapUrls()), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            // The same five minutes the public API caches for, so a Public
            // Profile that becomes indexable is listed within one window
            // instead of waiting on a deploy.
            "Cache-Control": "public, max-age=300",
          },
        }),
    },
  },
})
