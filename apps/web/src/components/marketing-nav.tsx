import { Link } from "@tanstack/react-router"

import { authClient } from "../auth"

export function MarketingNav() {
  const { data: session } = authClient.useSession()
  const appButtonLabel = session ? "Companion" : "Login"

  return (
    <nav className="marketing-nav" aria-label="Primary">
      <Link className="marketing-brand" to="/" aria-label="Sleevy home">
        <span className="logo">
          <img className="logoMark" src="/logo-mark.svg" alt="" height={28} />
          <span className="logoText">Sleevy</span>
        </span>
      </Link>
      <div className="marketing-nav-actions">
        {/* TODO: Demo is a placeholder — no destination yet */}
        <a className="marketing-nav-link" href="#" aria-disabled="true">Demo</a>
        <Link className="marketing-login" to="/inbox">
          <img className="marketing-login-icon" src="/logo-mark-color.png" alt="" height={20} />
          {appButtonLabel}
        </Link>
      </div>
    </nav>
  )
}
