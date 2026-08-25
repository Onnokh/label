import { useRef } from "react"

import { AccountPanel, DeleteAccountControl } from "../components/account/account"
import { ApiKeysPanel } from "../components/api-keys/api-keys"
import { ConnectedAppsPanel } from "../components/connected-apps/connected-apps"
import { PublicProfilePanel } from "../components/public-profile/public-profile"
import { SourceNamePanel } from "../components/source-name/source-name"
import { PageTitleBar } from "../components/ui/page-title-bar/page-title-bar"

/// Settings wears the Library's chrome rather than a hero of its own: the same
/// flush page header, the same collapsing title, and a column of cards where
/// the Library keeps its Folder cards and Saved Item rows.
export function SettingsPage() {
  const titleRef = useRef<HTMLHeadingElement>(null)

  return (
    <>
      <PageTitleBar title="Settings" watch={titleRef} />

      <div className="page-header">
        <div className="page-heading">
          <h1 className="page-title" ref={titleRef}>Settings</h1>
          <p className="page-subtitle">Make Sleevy yours, everywhere you save.</p>
        </div>
      </div>

      <div className="page-sections">
        <section className="settings-section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Account</h2>
              <p className="section-description">The identity your saves belong to</p>
            </div>
          </div>
          <AccountPanel />
        </section>
        <SourceNamePanel />
        <PublicProfilePanel />
        <ConnectedAppsPanel />
        <ApiKeysPanel />
      </div>

      <div className="settings-delete-account">
        <DeleteAccountControl />
      </div>
    </>
  )
}
