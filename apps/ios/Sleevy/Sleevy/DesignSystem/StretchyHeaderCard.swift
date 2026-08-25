import SwiftUI

/// What a stretchy header card draws with on a given frame.
struct StretchyHeaderContext {
    /// The card's height right now: the base height, plus the stretch a
    /// pull-down adds.
    let height: CGFloat
    /// False once the card is fully scrolled away; animated fields use this
    /// to pause.
    let isVisible: Bool
}

extension View {
    /// The shared header-card mechanic of the Inbox, folder, and profile
    /// screens: a card painted behind the native large title that scrolls
    /// away with the content and stretches on pull-down, so the top edge
    /// never opens a seam.
    ///
    /// The scroll distance changes on every scrolled pixel, so it lives in
    /// an observable box that only the header's own subview reads — a
    /// scroll frame re-renders the header alone, never the list behind it.
    /// Reading it from screen `@State` instead re-evaluated the whole list
    /// body per frame, which is what dropped frames on long lists.
    func stretchyHeaderCard(
        height: CGFloat,
        topInset: CGFloat,
        extraTopMargin: CGFloat = 0,
        @ViewBuilder header: @escaping (StretchyHeaderContext) -> some View
    ) -> some View {
        modifier(StretchyHeaderCardModifier(
            height: height,
            topInset: topInset,
            extraTopMargin: extraTopMargin,
            header: header
        ))
    }
}

/// The per-frame scroll reading. `@Observable` scopes the invalidation:
/// `distance` is only read inside `StretchyHeaderBackground.body`.
@MainActor
@Observable
private final class StretchyHeaderScrollModel {
    var distance: CGFloat = 0
    /// The resting baseline `distance` is measured against; only touched
    /// inside the scroll action, never in a body.
    @ObservationIgnored var baseline: CGFloat = 0
}

private struct StretchyHeaderCardModifier<Header: View>: ViewModifier {
    let height: CGFloat
    let topInset: CGFloat
    let extraTopMargin: CGFloat
    @ViewBuilder let header: (StretchyHeaderContext) -> Header

    @State private var model = StretchyHeaderScrollModel()

    func body(content: Content) -> some View {
        content
            // The large title stays native; the card is only painted behind
            // it. The margin moves the first row just below the card's
            // bottom edge.
            .contentMargins(.top, max(0, height - topInset) + extraTopMargin, for: .scrollContent)
            .background(alignment: .top) {
                StretchyHeaderBackground(baseHeight: height, model: model, header: header)
            }
            .onScrollGeometryChange(for: StretchyHeaderScrollReading.self) { geometry in
                StretchyHeaderScrollReading(
                    offset: geometry.contentOffset.y,
                    inset: geometry.contentInsets.top
                )
            } action: { _, reading in
                // Zero at rest, positive once the user scrolls, negative on
                // pull-to-refresh.
                //
                // The native refresh spinner grows the top inset when it
                // appears and hands the space back when it hides. Following
                // the live inset makes the card snap ~19pt at both moments,
                // so the card measures against a resting baseline instead.
                // A larger inset is adopted only while the list rests — the
                // spinner's inset never qualifies, since it only shows
                // mid-pull.
                guard reading.inset > 0 else { return }

                if reading.inset <= model.baseline || model.distance >= 0 {
                    model.baseline = reading.inset
                }
                model.distance = reading.offset + model.baseline
            }
    }
}

/// What the header card needs from the scroll geometry.
private struct StretchyHeaderScrollReading: Equatable {
    var offset: CGFloat
    var inset: CGFloat
}

private struct StretchyHeaderBackground<Header: View>: View {
    let baseHeight: CGFloat
    let model: StretchyHeaderScrollModel
    @ViewBuilder let header: (StretchyHeaderContext) -> Header

    var body: some View {
        header(StretchyHeaderContext(
            height: baseHeight + max(0, -model.distance),
            isVisible: model.distance < baseHeight
        ))
        .offset(y: -max(0, model.distance))
        .ignoresSafeArea(edges: .top)
    }
}
