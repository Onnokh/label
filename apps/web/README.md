# Sleevy Web Companion

Web companion workspace for manual URL capture, token settings, and a basic newest-first saved item list.

## IndexNow

The marketing site notifies IndexNow after a successful Coolify deployment.

1. The deployed default key is `e71501ace20aafcc1c8d1fa9b232b117`. To rotate
   it, generate a replacement with `openssl rand -hex 16` and add it as
   `INDEXNOW_KEY` to the Coolify **web** service's environment variables.
2. Redeploy once and verify that `https://sleevy.app/<key>.txt` returns only the
   key.
3. In the Compose application's Coolify settings, replace **Custom Start
   Command** with
   `docker compose up -d --wait && docker compose exec -T web bun indexnow-notify.ts`.

The notifier reads every `<loc>` from the built `sitemap.xml` and submits them
to IndexNow's global endpoint, so new SEO pages are picked up automatically as
long as they're in the sitemap. To submit a different set for a deployment, set
`INDEXNOW_URLS` to a comma-separated list of same-origin paths or URLs, which
overrides the sitemap. The key is publicly visible by design: IndexNow uses the
file to verify ownership.
