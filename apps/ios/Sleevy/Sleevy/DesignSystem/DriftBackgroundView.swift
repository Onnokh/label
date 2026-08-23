import MetalKit
import SwiftUI

/// Draws the calm drift field defined in `DriftShader.metal` — the My
/// Profile header's counterpart to the Inbox's `AuroraBackground`. Kept as
/// its own view for the same reason the aurora is: both run a redraw loop
/// with a time uniform, unlike the static mesh gradients.
struct DriftBackground: UIViewRepresentable {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion

    var isVisible = true

    func makeUIView(context: Context) -> DriftView {
        let view = DriftView()
        view.isLightMode = colorScheme == .light
        updatePlayback(of: view)
        return view
    }

    func updateUIView(_ uiView: DriftView, context: Context) {
        uiView.isLightMode = colorScheme == .light
        updatePlayback(of: uiView)
    }

    static func dismantleUIView(_ uiView: DriftView, coordinator: Void) {
        uiView.shouldAnimate = false
    }

    private func updatePlayback(of view: DriftView) {
        view.shouldAnimate = isVisible
            && scenePhase == .active
            && !accessibilityReduceMotion
    }
}

final class DriftView: AnimatedMetalView {
    /// `MTKView.delegate` is weak, so the renderer has to be held here.
    private var renderer: DriftRenderer?

    /// Light mode draws the pastel wash instead of added light.
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
        // Only the mist shows. The layer composites over the list, so the
        // card's backdrop IS the list background -- no seam possible.
        isOpaque = false
        clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)

        guard let device else { return }

        renderer = DriftRenderer(device: device)
        delegate = renderer
        rendererDidBecomeReady()
    }
}

final class DriftRenderer: NSObject, MTKViewDelegate {
    var isLightMode = false

    private let commandQueue: MTLCommandQueue
    private let pipelineState: MTLRenderPipelineState
    private let startTime = CACurrentMediaTime()

    init?(device: MTLDevice) {
        guard
            let queue = device.makeCommandQueue(),
            let library = device.makeDefaultLibrary(),
            let vertexFn = library.makeFunction(name: "drift_vertex"),
            let fragmentFn = library.makeFunction(name: "drift_fragment")
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
