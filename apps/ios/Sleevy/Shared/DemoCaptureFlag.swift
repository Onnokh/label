import Foundation

/// Carries marketing-capture mode across the process boundary into the share
/// extension.
///
/// `SLEEVY_DEMO_MODE` reaches the app as a launch environment variable, but the
/// share extension is launched by the host app being shared from (Safari), so
/// it never sees that variable. The app mirrors the flag into the shared app
/// group at launch and the extension reads it here, which lets a screenshot run
/// capture the real share sheet without a real session behind it.
///
/// The app writes `false` on every non-demo launch, so a normal build can never
/// inherit a stale demo flag from an earlier capture run.
nonisolated enum DemoCaptureFlag {
    private static let key = "demo.capture-mode"

    static var isOn: Bool {
        get { SleevyUserPreferences.defaults.bool(forKey: key) }
        set { SleevyUserPreferences.defaults.set(newValue, forKey: key) }
    }
}
