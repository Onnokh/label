import SwiftUI

/// SwiftUI's view of the shared `MeshGradientView`. The field itself, and the
/// renderer that draws it, live in `Shared/` so the share extension draws the
/// same one.
struct MetalGradientBackground: UIViewRepresentable {
    func makeUIView(context: Context) -> MeshGradientView {
        MeshGradientView()
    }

    func updateUIView(_ uiView: MeshGradientView, context: Context) {}
}
