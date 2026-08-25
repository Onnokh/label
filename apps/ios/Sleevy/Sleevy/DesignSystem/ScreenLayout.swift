import Foundation

/// Shared layout rhythm for top-level screens.
enum ScreenLayout {
    /// The distance between a screen's large navigation title and its first
    /// content on plain-list screens, sized to match the ~20pt a grouped
    /// Form (Settings) gets built in — so switching screens never makes the
    /// content jump vertically. The Inbox is exempt: its content start is
    /// set by the brand header card's bottom edge.
    static let contentTopSpacing: CGFloat = 20
}
