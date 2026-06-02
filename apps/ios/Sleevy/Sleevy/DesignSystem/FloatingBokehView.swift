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
                        .foregroundStyle(.white.opacity(0.7))
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

    private static let icons = [
        "bookmark.fill", "link", "globe", "doc.text.fill",
        "safari.fill", "star.fill", "tag.fill", "newspaper.fill",
    ]

    init() {
        let d = CGFloat.random(in: 0...1)
        depth = d

        // Back (0): small, blurry, faint — Front (1): large, sharper, brighter
        size = 25 + d * 55
        cornerRadius = size * CGFloat.random(in: 0.2...0.35)
        blur = 14 - d * 8
        opacity = 1.0

        let colors: [Color] = [
            .white,
            Color(red: 0.953, green: 0.753, blue: 0.529),
            Color(red: 0.961, green: 0.588, blue: 0.514),
            Color(red: 0.969, green: 0.333, blue: 0.671),
        ]
        color = colors.randomElement()!
        icon = Self.icons.randomElement()!

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
