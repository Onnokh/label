import { Outlet, Link } from "@tanstack/react-router"
import { MarketingNav } from "../components/marketing-nav"

export function MarketingLayout() {
  return (
    <main className="marketing-page">
      <MarketingNav />
      <Outlet />
      <footer className="marketing-footer">
        <img className="marketing-footer-bg" src="/footer-glow.webp" alt="" aria-hidden="true" />
        <div className="marketing-footer-inner">
          <div className="marketing-footer-brand">
            <div className="marketing-footer-logo">
              <img src="/logo-mark-white.svg" alt="" width={22} height={34} />
              <span>Sleevy</span>
            </div>
            <p>
              A scriptable bookmark manager app for saving links, keeping your reading list in sync, and coming
              back when you are ready.
            </p>
          </div>

          <nav className="marketing-footer-col" aria-label="Integrations">
            <span className="marketing-footer-col-title">Integrations</span>
            <a href="https://www.raycast.com/onnokh/sleevy">Raycast Extension</a>
            <a href="https://chromewebstore.google.com/detail/sleevy/ogffdakffimomfahfpihfmgdaincemjj">Chrome Extension</a>
            <Link to="/inbox">Web Companion</Link>
          </nav>

          <nav className="marketing-footer-col" aria-label="Extras">
            <span className="marketing-footer-col-title">Extras</span>
            <Link to="/docs">Documentation</Link>
            <Link to="/support">Support</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </main>
  )
}
