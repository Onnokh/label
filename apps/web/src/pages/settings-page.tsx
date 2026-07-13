import { AccountPanel, DeleteAccountControl } from "../components/account/account"
import { ApiKeysPanel } from "../components/api-keys/api-keys"
import { ConnectedAppsPanel } from "../components/connected-apps/connected-apps"
import { BlueMeshGradient } from "../components/marketing/hero/blue-mesh-gradient"
import { SourceNamePanel } from "../components/source-name/source-name"

export function SettingsPage() {
  return (
    <div className="settings-page settings-page-redesign">
      <div className="page-header">
        <BlueMeshGradient variant="settings" />
        <div>
          <h1 className="page-title">Settings</h1>
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
