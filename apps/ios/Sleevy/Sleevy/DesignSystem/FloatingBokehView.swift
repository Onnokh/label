import SwiftUI

struct FloatingBokehView: View {
    @State private var particles: [BokehParticle] = (0..<18).map { _ in BokehParticle() }
    @State private var animated = false

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            ForEach(particles.sorted(by: { $0.depth < $1.depth })) { particle in
                ZStack {
                    RoundedRectangle(cornerRadius: particle.cornerRadius, style: .continuous)
                        .fill(particle.color)
                    Image(systemName: particle.icon)
                        .font(.system(size: particle.size * 0.4, weight: .medium))
                        .foregroundStyle(.white.opacity(0.4))
                }
                .frame(width: particle.size, height: particle.size)
                .blur(radius: particle.blur)
                .opacity(particle.opacity)
                .position(
                    x: animated ? particle.endX * size.width : particle.startX * size.width,
                    y: animated ? particle.endY * size.height : particle.startY * size.height
                )
                .rotationEffect(.degrees(animated ? particle.endRotation : 0))
                .animation(
                    .linear(duration: particle.duration).repeatForever(autoreverses: true),
                    value: animated
                )
            }
        }
        .allowsHitTesting(false)
        .onAppear { animated = true }
    }
}

private struct BokehParticle: Identifiable {
    let id = UUID()
    let depth: CGFloat
    let size: CGFloat
    let cornerRadius: CGFloat
    let blur: CGFloat
    let opacity: Double
    let color: Color
    let startX: CGFloat
    let startY: CGFloat
    let endX: CGFloat
    let endY: CGFloat
    let icon: String
    let endRotation: Double
    let duration: Double

    /// A tile is one saved link, so it pairs a tint with a glyph: picking the
    /// two separately produced tiles that read as nothing in particular.
    struct Hint {
        let color: Color
        let icon: String
    }

    /// The tiles drift over the dark login mesh. Two hues are deliberately
    /// absent: white read as a hole in the screen, and the cream one came
    /// through as yellow.
    private static let accentShade: Double = 0.6

    /// Some tiles nod at where a link came from. They are meant to be
    /// *recognized*, not mistaken for the real thing, so each one is a stock SF
    /// Symbol on an off-brand tint rather than anyone's actual mark — no
    /// wordmark, no logo silhouette, no exact brand colour. At this blur radius
    /// only the tint and a rough shape survive, which is the whole intent.
    private static let hints: [Hint] = [
        // Reads as X: near-black tile, plain system cross.
        Hint(
            color: Color(red: 0.09, green: 0.09, blue: 0.11),
            icon: "xmark"
        ),
        // Reads as Reddit: its orange taken well down into this palette, and a
        // speech bubble for the conversation rather than the mascot.
        Hint(
            color: Color(red: 1.00 * accentShade, green: 0.27 * accentShade, blue: 0.05 * accentShade),
            icon: "bubble.left.fill"
        ),
        // The rest stay generic so the field reads as a library of saved links
        // rather than a wall of logos. Neutrals sit just above the mesh's own
        // darkest values: any darker and they read as voids, not tiles.
        Hint(color: Color(red: 0.10, green: 0.10, blue: 0.13), icon: "bookmark.fill"),
        Hint(color: Color(red: 0.17, green: 0.17, blue: 0.21), icon: "link"),
        Hint(color: Color(red: 0.22, green: 0.23, blue: 0.28), icon: "globe"),
        Hint(color: Color(red: 0.17, green: 0.17, blue: 0.21), icon: "doc.text.fill"),
        Hint(color: Color(red: 0.22, green: 0.23, blue: 0.28), icon: "newspaper.fill"),
        Hint(
            color: Color(red: 0.961 * accentShade, green: 0.588 * accentShade, blue: 0.514 * accentShade),
            icon: "star.fill"
        ),
        Hint(
            color: Color(red: 0.969 * accentShade, green: 0.333 * accentShade, blue: 0.671 * accentShade),
            icon: "tag.fill"
        ),
    ]

    init() {
        let d = CGFloat.random(in: 0...1)
        depth = d

        // Back (0): small, blurry, faint — Front (1): large, sharper, brighter
        size = 25 + d * 55
        cornerRadius = size * CGFloat.random(in: 0.2...0.35)
        blur = 14 - d * 8
        opacity = 1.0

        let hint = Self.hints.randomElement()!
        color = hint.color
        icon = hint.icon

        startX = CGFloat.random(in: -0.15...1.15)
        startY = CGFloat.random(in: -0.15...1.15)

        let drift = 0.15 + d * 0.3
        endX = startX + CGFloat.random(in: -drift...drift)
        endY = startY + CGFloat.random(in: -drift...drift)
        endRotation = Double.random(in: -25...25)

        // Front particles move faster
        duration = Double(22 - d * 12) + Double.random(in: -2...2)
    }
}
