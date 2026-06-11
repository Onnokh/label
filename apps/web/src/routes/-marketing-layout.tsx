import { Outlet, Link } from "@tanstack/react-router"
import { MarketingNav } from "../components/marketing-nav"
import { Logo } from "../Logo"

export function MarketingLayout() {
  return (
    <main className="marketing-page">
      <MarketingNav />
      <Outlet />
      <footer className="marketing-footer">
        <div className="marketing-footer-inner">
          <div className="marketing-footer-brand">
            <Logo size={42} />
            <p>
              A scriptable bookmark manager app for saving links, keeping your reading list in sync, and coming
              back when you are ready.
            </p>
          </div>

          <nav className="marketing-footer-products" aria-label="Products">
            <Link to="/inbox">Web Companion</Link>
            <a href="https://www.raycast.com/onnokh/sleevy">Raycast Extension</a>
            <a href="https://chromewebstore.google.com/detail/sleevy/ogffdakffimomfahfpihfmgdaincemjj">Chrome Extension</a>
          </nav>

          <nav className="marketing-footer-links" aria-label="Footer">
            <Link to="/docs">Docs</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/support">Support</Link>
          </nav>
        </div>
      </footer>
    </main>
  )
}
