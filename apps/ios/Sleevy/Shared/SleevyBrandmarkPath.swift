import CoreGraphics

/// The Sleevy brandmark, traced from `assets/brandmark-white.svg`
/// (viewBox `0 0 462 587`).
///
/// This lives in `Shared/` because the sign-in screen and the share extension
/// both draw the mark. They each used to hold their own hand-copied path, and
/// the copies drifted: the extension kept drawing the previous six-tile mark
/// after the app had moved on. One path means that cannot happen again.
enum SleevyBrandmarkPath {
    private static let width: CGFloat = 462
    private static let height: CGFloat = 587

    /// The mark's own aspect ratio. Size a frame with this rather than guessing,
    /// or `path(in:)` aspect-fits and leaves dead space on one axis.
    static let aspectRatio: CGFloat = width / height

    /// The mark, scaled to fit `rect` and centred within it.
    static func path(in rect: CGRect) -> CGPath {
        let scale = min(rect.width / width, rect.height / height)
        let offsetX = rect.minX + (rect.width - width * scale) / 2
        let offsetY = rect.minY + (rect.height - height * scale) / 2

        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: offsetX + x * scale, y: offsetY + y * scale)
        }

        let path = CGMutablePath()

        // Top stripe: rounded on the leading edge, cut square where it meets
        // the middle stripe.
        path.move(to: p(0, 128))
        path.addCurve(to: p(128, 0), control1: p(0, 57.3076), control2: p(57.3076, 0))
        path.addLine(to: p(462, 0))
        path.addLine(to: p(462, 48))
        path.addCurve(to: p(334, 176), control1: p(462, 118.692), control2: p(404.692, 176))
        path.addLine(to: p(0, 176))
        path.closeSubpath()

        // Middle stripe: the mirror of the other two, so the S reads as one
        // continuous ribbon.
        path.move(to: p(0, 205))
        path.addLine(to: p(334, 205))
        path.addCurve(to: p(462, 333), control1: p(404.692, 205), control2: p(462, 262.308))
        path.addLine(to: p(462, 381))
        path.addLine(to: p(128, 381))
        path.addCurve(to: p(0, 253), control1: p(57.3075, 381), control2: p(0, 323.692))
        path.closeSubpath()

        // Bottom stripe.
        path.move(to: p(0, 538))
        path.addCurve(to: p(128, 410), control1: p(0, 467.308), control2: p(57.3076, 410))
        path.addLine(to: p(462, 410))
        path.addLine(to: p(462, 459))
        path.addCurve(to: p(334, 587), control1: p(462, 529.692), control2: p(404.692, 587))
        path.addLine(to: p(0, 587))
        path.closeSubpath()

        return path
    }
}
