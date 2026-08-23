import MetalKit
import SwiftUI

/// Draws the animated aurora field defined in `AuroraShader.metal`.
///
/// This is separate from the shared `MeshGradientView` on purpose: the mesh is
/// a still image drawn once, while the aurora runs a redraw loop with a time
/// uniform. Keeping them apart means the sign-in screen and the share
/// extension stay on the cheap static path.
struct AuroraBackground: UIViewRepresentable {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion

    var isVisible = true

    func makeUIView(context: Context) -> AuroraView {
        let view = AuroraView()
        view.isLightMode = colorScheme == .light
        updatePlayback(of: view)
        return view
    }

    func updateUIView(_ uiView: AuroraView, context: Context) {
        uiView.isLightMode = colorScheme == .light
        updatePlayback(of: uiView)
    }

    static func dismantleUIView(_ uiView: AuroraView, coordinator: Void) {
        uiView.shouldAnimate = false
    }

    private func updatePlayback(of view: AuroraView) {
        view.shouldAnimate = isVisible
            && scenePhase == .active
            && !accessibilityReduceMotion
    }
}

final class AuroraView: AnimatedMetalView {
    /// `MTKView.delegate` is weak, so the renderer has to be held here.
    private var renderer: AuroraRenderer?

    /// Light mode draws the pastel variant of the field.
    var isLightMode = false {
        didSet {
            guard isLightMode != oldValue else { return }
            renderer?.isLightMode = isLightMode
            redrawIfPaused()
        }
    }

    init() {
        let device = MTLCreateSystemDefaultDevice()
        super.init(frame: .zero, device: device)

        colorPixelFormat = .bgra8Unorm
        framebufferOnly = true
        // Only the aurora shows. The layer composites over the list, so the
        // card's backdrop IS the list background -- no seam possible.
        isOpaque = false
        clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)

        guard let device else { return }

        renderer = AuroraRenderer(device: device)
        delegate = renderer
        rendererDidBecomeReady()
    }
}

final class AuroraRenderer: NSObject, MTKViewDelegate {
    var isLightMode = false

    private let commandQueue: MTLCommandQueue
    private let pipelineState: MTLRenderPipelineState
    private let startTime = CACurrentMediaTime()

    init?(device: MTLDevice) {
        guard
            let queue = device.makeCommandQueue(),
            let library = device.makeDefaultLibrary(),
            let vertexFn = library.makeFunction(name: "aurora_vertex"),
            let fragmentFn = library.makeFunction(name: "aurora_fragment")
        else { return nil }

        let desc = MTLRenderPipelineDescriptor()
        desc.vertexFunction = vertexFn
        desc.fragmentFunction = fragmentFn
        desc.colorAttachments[0].pixelFormat = .bgra8Unorm

        guard let pipeline = try? device.makeRenderPipelineState(descriptor: desc) else {
            return nil
        }

        commandQueue = queue
        pipelineState = pipeline
        super.init()
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard
            let drawable = view.currentDrawable,
            let descriptor = view.currentRenderPassDescriptor,
            let buffer = commandQueue.makeCommandBuffer(),
            let encoder = buffer.makeRenderCommandEncoder(descriptor: descriptor)
        else { return }

        var time = Float(CACurrentMediaTime() - startTime)
        var lightMode: Float = isLightMode ? 1 : 0

        encoder.setRenderPipelineState(pipelineState)
        encoder.setFragmentBytes(&time, length: MemoryLayout<Float>.size, index: 0)
        encoder.setFragmentBytes(&lightMode, length: MemoryLayout<Float>.size, index: 1)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()

        buffer.present(drawable)
        buffer.commit()
    }
}
