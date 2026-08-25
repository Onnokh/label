import { useRef } from "react"

import { AccountPanel, DeleteAccountControl } from "../components/account/account"
import { ApiKeysPanel } from "../components/api-keys/api-keys"
import { ConnectedAppsPanel } from "../components/connected-apps/connected-apps"
import { BlueMeshGradient } from "../components/marketing/hero/blue-mesh-gradient"
import { PublicProfilePanel } from "../components/public-profile/public-profile"
import { SourceNamePanel } from "../components/source-name/source-name"
import { PageTitleBar } from "../components/ui/page-title-bar/page-title-bar"

export function SettingsPage() {
  const titleRef = useRef<HTMLHeadingElement>(null)

  return (
    <div className="settings-page settings-page-redesign">
      <PageTitleBar title="Settings" watch={titleRef} />

      <div className="page-header">
        <BlueMeshGradient variant="settings" />
        <div>
          <h1 className="page-title" ref={titleRef}>Settings</h1>
          <p className="page-description">Make Sleevy yours, everywhere you save.</p>
        </div>
        <div className="settings-header-account">
          <AccountPanel />
        </div>
      </div>
      <div className="page-sections">
        <div className="settings-group settings-group-preferences">
          <SourceNamePanel />
        </div>
        <div className="settings-group settings-group-access">
          <PublicProfilePanel />
        </div>
        <div className="settings-group settings-group-access">
          <ConnectedAppsPanel />
        </div>
        <div className="settings-group settings-group-access">
          <ApiKeysPanel />
        </div>
      </div>
      <div className="settings-delete-account">
        <DeleteAccountControl />
      </div>
    </div>
  )
}
