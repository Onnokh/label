import SwiftUI

/// Shared layout rhythm for top-level screens.
enum ScreenLayout {
    /// The distance between a screen's large navigation title and its first
    /// content on plain-list screens, sized to match the ~20pt a grouped
    /// Form (Settings) gets built in — so switching screens never makes the
    /// content jump vertically. The Inbox is exempt: its content start is
    /// set by the brand header card's bottom edge.
    static let contentTopSpacing: CGFloat = 20

    /// The resting height of a screen's brand header card.
    ///
    /// The card is painted behind the large title and sets, through the scroll
    /// content margin, where the first row starts — so its height has to match
    /// where the title block actually ends, and that differs by layout:
    ///
    /// - Compact width (iPhone): the large title scrolls with the content,
    ///   below the safe-area inset. The card keeps a width-proportional depth
    ///   so it holds the title and stays in proportion across phone sizes.
    /// - Regular width (iPad): the large title sits inside the navigation bar,
    ///   so `topInset` already spans the whole title block. A card exactly that
    ///   tall ends where the title block ends; anything deeper is a band of
    ///   empty space between the subtitle and the first row.
    static func headerCardHeight(width: CGFloat, topInset: CGFloat, isRegularWidth: Bool) -> CGFloat {
        isRegularWidth ? topInset : width * headerCardRatio
    }

    /// The one depth every brand header card uses. The Inbox and a folder
    /// carry the same title block, so they share the ratio rather than each
    /// picking one — that is what keeps the two screens identical. The card
    /// only has to cover the large title: the subtitle is a list row.
    static let headerCardRatio: CGFloat = 0.40
}

/// The count line under a screen's large title — "19 unread", "4 saves · 2
/// unread" — as the list's first row rather than an overlay on the header
/// card.
///
/// It belongs to the scroll content on purpose. Pinned to the card it tracked
/// the card's stretch, and a pull-to-refresh grows the scroll inset enough
/// that the card outruns the rows and the subtitle lands on the first one.
/// As a row it moves with the rows by construction, in every pull and refresh
/// state, so it cannot collide with them.
struct ListSubtitleRow: View {
    let subtitle: String?

    var body: some View {
        if let subtitle {
            Text(subtitle)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.secondary)
                .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 10, trailing: 20))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
        }
    }
}
