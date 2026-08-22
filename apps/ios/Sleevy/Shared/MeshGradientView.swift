import MetalKit

/// Draws the mesh field defined in `GradientShader.metal`.
///
/// This lives in `Shared/` alongside the shader so the sign-in screen and the
/// share extension render the same field from the same source. The extension
/// previously approximated it with a three-stop `CAGradientLayer`, which is how
/// it ended up still showing the old peach-to-magenta palette.
final class MeshGradientView: MTKView {
    /// `MTKView.delegate` is weak, so the renderer has to be held here.
    private var renderer: GradientRenderer?

    init() {
        let device = MTLCreateSystemDefaultDevice()
        super.init(frame: .zero, device: device)

        colorPixelFormat = .bgra8Unorm
        framebufferOnly = true
        // The mesh is a still field, so there is nothing to animate. Draw it
        // when the view is laid out rather than holding a redraw loop open.
        isPaused = true
        enableSetNeedsDisplay = true

        guard let device else { return }

        renderer = GradientRenderer(device: device)
        delegate = renderer
    }

    @available(*, unavailable)
    required init(coder: NSCoder) {
        fatalError("MeshGradientView is created in code, never from a nib.")
    }
}

final class GradientRenderer: NSObject, MTKViewDelegate {
    private let commandQueue: MTLCommandQueue
    private let pipelineState: MTLRenderPipelineState

    init?(device: MTLDevice) {
        guard
            let queue = device.makeCommandQueue(),
            let library = device.makeDefaultLibrary(),
            let vertexFn = library.makeFunction(name: "gradient_vertex"),
            let fragmentFn = library.makeFunction(name: "gradient_fragment")
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

        encoder.setRenderPipelineState(pipelineState)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()

        buffer.present(drawable)
        buffer.commit()
    }
}
