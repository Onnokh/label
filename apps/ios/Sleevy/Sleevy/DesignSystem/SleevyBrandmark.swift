import SwiftUI

struct SleevyBrandmark: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height

        // Original viewBox: 0 0 473 705
        let sx = w / 473
        let sy = h / 705
        let s = min(sx, sy)
        let ox = (w - 473 * s) / 2
        let oy = (h - 705 * s) / 2

        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: ox + x * s, y: oy + y * s)
        }

        var path = Path()

        // Top-left square (semi-transparent in SVG, rendered solid here)
        path.addRoundedRect(
            in: CGRect(
                origin: p(9.1, 9.1),
                size: CGSize(width: 203 * s, height: 202 * s)
            ),
            cornerRadii: .init(topLeading: 20 * s, bottomLeading: 20 * s, bottomTrailing: 20 * s, topTrailing: 20 * s)
        )

        // Top-right arrow (pointing up-left)
        path.move(to: p(278.07, 205.96))
        path.addCurve(
            to: p(244.1, 191.65),
            control1: p(265.4, 218.32),
            control2: p(244.1, 209.35)
        )
        path.addLine(to: p(244.1, 29.1))
        path.addCurve(
            to: p(264.1, 9.1),
            control1: p(244.1, 18.05),
            control2: p(253.05, 9.1)
        )
        path.addLine(to: p(425.22, 9.1))
        path.addCurve(
            to: p(439.66, 42.94),
            control1: p(442.84, 9.1),
            control2: p(451.85, 30.22)
        )
        path.addLine(to: p(360.01, 126.03))
        path.addLine(to: p(278.07, 205.96))
        path.closeSubpath()

        // Middle-left arrow (pointing left)
        path.move(to: p(15.24, 277.65))
        path.addCurve(
            to: p(29.55, 243.69),
            control1: p(2.88, 264.99),
            control2: p(11.85, 243.69)
        )
        path.addLine(to: p(192.1, 243.69))
        path.addCurve(
            to: p(212.1, 263.69),
            control1: p(203.15, 243.69),
            control2: p(212.1, 252.64)
        )
        path.addLine(to: p(212.1, 424.81))
        path.addCurve(
            to: p(178.26, 439.25),
            control1: p(212.1, 442.42),
            control2: p(190.98, 451.44)
        )
        path.addLine(to: p(95.18, 359.6))
        path.addLine(to: p(15.24, 277.65))
        path.closeSubpath()

        // Center-right square
        path.addRoundedRect(
            in: CGRect(
                origin: p(244.1, 243.69),
                size: CGSize(width: 203 * s, height: 202 * s)
            ),
            cornerRadii: .init(topLeading: 20 * s, bottomLeading: 20 * s, bottomTrailing: 20 * s, topTrailing: 20 * s)
        )

        // Bottom-left arrow (pointing down-left)
        path.move(to: p(15.24, 645.72))
        path.addCurve(
            to: p(29.55, 679.69),
            control1: p(2.88, 658.39),
            control2: p(11.85, 679.69)
        )
        path.addLine(to: p(192.1, 679.69))
        path.addCurve(
            to: p(212.1, 659.69),
            control1: p(203.15, 679.69),
            control2: p(212.1, 670.73)
        )
        path.addLine(to: p(212.1, 498.57))
        path.addCurve(
            to: p(178.26, 484.13),
            control1: p(212.1, 480.95),
            control2: p(190.98, 471.94)
        )
        path.addLine(to: p(95.18, 563.78))
        path.addLine(to: p(15.24, 645.72))
        path.closeSubpath()

        // Bottom-right square
        path.addRoundedRect(
            in: CGRect(
                origin: p(244.1, 477.69),
                size: CGSize(width: 203 * s, height: 202 * s)
            ),
            cornerRadii: .init(topLeading: 20 * s, bottomLeading: 20 * s, bottomTrailing: 20 * s, topTrailing: 20 * s)
        )

        return path
    }
}
