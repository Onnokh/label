import SwiftUI

/// Applies `navigationSubtitle` where the OS has it; earlier systems simply
/// show no subtitle.
struct NavigationSubtitleIfAvailable: ViewModifier {
    let subtitle: String?

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            // An empty subtitle rather than a conditional branch: flipping
            // between branches when the subtitle first resolves would swap
            // the content's structural identity, resetting a pushed list's
            // scroll state and collapsing its large title.
            content.navigationSubtitle(subtitle ?? "")
        } else {
            content
        }
    }
}
