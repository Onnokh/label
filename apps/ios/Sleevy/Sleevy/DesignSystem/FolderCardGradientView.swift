import MetalKit
import SwiftUI

/// The palette a folder card gradient wears: a deep ground tone, the carrying
/// mid colour, and a highlight the field reaches for at its brightest. The
/// folder's chosen accent colour decides which palette a card gets.
///
/// Each palette is a scheme, not one hue: the highlight sits a hue over from
/// the mid (red walks into amber, blue into violet, purple into pink), the
/// way the Inbox aurora walks blue -> purple -> pink. Every stop is softened
/// toward pastel so the coronas keep the aurora's calm instead of shouting
/// next to it.
struct FolderCardPalette: Equatable {
    let deep: SIMD3<Float>
    let mid: SIMD3<Float>
    let highlight: SIMD3<Float>

    /// Crimson into amber.
    static let red = FolderCardPalette(
        deep: SIMD3(0.30, 0.07, 0.09),
        mid: SIMD3(0.82, 0.34, 0.20),
        highlight: SIMD3(1.0, 0.74, 0.46)
    )

    /// Ember into gold.
    static let orange = FolderCardPalette(
        deep: SIMD3(0.32, 0.15, 0.05),
        mid: SIMD3(0.86, 0.52, 0.24),
        highlight: SIMD3(1.0, 0.86, 0.58)
    )

    /// Ochre into pale gold.
    static let yellow = FolderCardPalette(
        deep: SIMD3(0.30, 0.23, 0.07),
        mid: SIMD3(0.84, 0.68, 0.32),
        highlight: SIMD3(1.0, 0.94, 0.68)
    )

    /// Forest into mint-teal.
    static let green = FolderCardPalette(
        deep: SIMD3(0.05, 0.24, 0.15),
        mid: SIMD3(0.34, 0.68, 0.48),
        highlight: SIMD3(0.68, 0.94, 0.78)
    )

    /// Deep sea into cyan.
    static let teal = FolderCardPalette(
        deep: SIMD3(0.03, 0.20, 0.24),
        mid: SIMD3(0.24, 0.58, 0.62),
        highlight: SIMD3(0.62, 0.88, 0.92)
    )

    /// Midnight into violet.
    static let blue = FolderCardPalette(
        deep: SIMD3(0.07, 0.11, 0.30),
        mid: SIMD3(0.32, 0.46, 0.84),
        highlight: SIMD3(0.70, 0.74, 0.98)
    )

    /// Violet into pink.
    static let purple = FolderCardPalette(
        deep: SIMD3(0.20, 0.09, 0.36),
        mid: SIMD3(0.58, 0.42, 0.86),
        highlight: SIMD3(0.92, 0.70, 0.90)
    )

    /// Rose into blush.
    static let pink = FolderCardPalette(
        deep: SIMD3(0.30, 0.08, 0.18),
        mid: SIMD3(0.82, 0.40, 0.56),
        highlight: SIMD3(1.0, 0.78, 0.82)
    )

    /// Slate into moonlight.
    static let neutral = FolderCardPalette(
        deep: SIMD3(0.16, 0.18, 0.23),
        mid: SIMD3(0.52, 0.57, 0.67),
        highlight: SIMD3(0.88, 0.91, 0.97)
    )
}

/// Which of the shipped card fields to draw.
enum FolderCardStyle: Float {
    /// Rays fanning from a seed-placed zenith past the top edge. The
    /// folder cards' field.
    case corona = 0
    /// A curved auroral bow with hanging tails. The profile hero's field.
    case arc = 1
}

/// Draws one card's field. Static by default — one draw, no render loop,
/// because a stack of cards should cost nothing at rest — with an opt-in
/// slow drift for a screen's single header card.
struct FolderCardGradient: UIViewRepresentable {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion

    let palette: FolderCardPalette
    /// Nudges the composition (where the zenith hangs) between 0 and 1,
    /// so two cards read as siblings, not copies.
    var shape: Float = 0.5
    /// The frozen clock value the card renders at. Distinct seeds give
    /// distinct frozen moments of the same field.
    var seed: Float = 0
    /// Lets the light drift slowly through the frozen composition, like the
    /// Inbox aurora. Off for card stacks (a grid of render loops would cost
    /// real power); on for the one header a screen shows.
    var animated = false
    var style = FolderCardStyle.corona
    /// 1 makes every corona ray end at its own height above the card's
    /// bottom edge — for tall cards like the folder header, where the fan
    /// would otherwise sink into the bottom clip. Slim rows keep 0.
    var bottomFade: Float = 0

    /// Stable pseudo-randomness from an identity (a folder id): the grid
    /// varies card to card but never reshuffles between visits.
    static func seed(for identity: String) -> Float {
        Float(identity.unicodeScalars.reduce(UInt32(5)) { ($0 &* 31 &+ $1.value) % 997 })
    }

    static func shape(for identity: String) -> Float {
        Float(identity.unicodeScalars.reduce(UInt32(7)) { ($0 &* 17 &+ $1.value) % 101 }) / 100
    }

    func makeUIView(context: Context) -> FolderCardGradientMetalView {
        let view = FolderCardGradientMetalView()
        view.apply(palette: palette, shape: shape, seed: seed, animated: isAnimating, style: style, bottomFade: bottomFade)
        return view
    }

    func updateUIView(_ uiView: FolderCardGradientMetalView, context: Context) {
        uiView.apply(palette: palette, shape: shape, seed: seed, animated: isAnimating, style: style, bottomFade: bottomFade)
    }

    static func dismantleUIView(_ uiView: FolderCardGradientMetalView, coordinator: Void) {
        uiView.shouldAnimate = false
    }

    private var isAnimating: Bool {
        animated && scenePhase == .active && !accessibilityReduceMotion
    }
}

/// The Metal stack every folder card shares. A list recycles its rows, so
/// cards are created while the user scrolls — and creating a command queue
/// or compiling the pipeline per card is exactly the kind of hitch that
/// reads as a dropped frame. All cards draw with the same shader, so one
/// device, one queue, and one compiled pipeline serve them all.
@MainActor
enum FolderCardMetalContext {
    static let device = MTLCreateSystemDefaultDevice()

    static let commandQueue = device?.makeCommandQueue()

    static let pipelineState: MTLRenderPipelineState? = {
        guard
            let device,
            let library = device.makeDefaultLibrary(),
            let vertexFn = library.makeFunction(name: "folder_card_vertex"),
            let fragmentFn = library.makeFunction(name: "folder_card_fragment")
        else { return nil }

        let desc = MTLRenderPipelineDescriptor()
        desc.vertexFunction = vertexFn
        desc.fragmentFunction = fragmentFn
        desc.colorAttachments[0].pixelFormat = .bgra8Unorm

        return try? device.makeRenderPipelineState(descriptor: desc)
    }()
}

final class FolderCardGradientMetalView: AnimatedMetalView {
    /// `MTKView.delegate` is weak, so the renderer has to be held here.
    private var renderer: FolderCardGradientRenderer?

    init() {
        super.init(frame: .zero, device: FolderCardMetalContext.device)

        colorPixelFormat = .bgra8Unorm
        framebufferOnly = true
        // The field paints every pixel itself (alpha 1); opaque lets the
        // compositor skip blending a whole grid of cards.
        isOpaque = true
        clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        // Purely decorative, and it sits under the card's tap target.
        isUserInteractionEnabled = false
        // Static by default: the paused MTKView draws once per state change.
        shouldAnimate = false

        renderer = FolderCardGradientRenderer(
            commandQueue: FolderCardMetalContext.commandQueue,
            pipelineState: FolderCardMetalContext.pipelineState
        )
        delegate = renderer
        rendererDidBecomeReady()
    }

    func apply(palette: FolderCardPalette, shape: Float, seed: Float, animated: Bool, style: FolderCardStyle, bottomFade: Float) {
        guard
            renderer?.palette != palette
                || renderer?.shape != shape
                || renderer?.seed != seed
                || renderer?.animated != animated
                || renderer?.style != style
                || renderer?.bottomFade != bottomFade
        else { return }

        renderer?.palette = palette
        renderer?.shape = shape
        renderer?.seed = seed
        renderer?.animated = animated
        renderer?.style = style
        renderer?.bottomFade = bottomFade
        shouldAnimate = animated
        redrawIfPaused()
    }
}

final class FolderCardGradientRenderer: NSObject, MTKViewDelegate {
    var palette = FolderCardPalette.neutral
    var shape: Float = 0.5
    var seed: Float = 0
    var animated = false
    var style = FolderCardStyle.corona
    var bottomFade: Float = 0

    private let commandQueue: MTLCommandQueue
    private let pipelineState: MTLRenderPipelineState
    private let startTime = CACurrentMediaTime()

    init?(commandQueue: MTLCommandQueue?, pipelineState: MTLRenderPipelineState?) {
        guard let commandQueue, let pipelineState else { return nil }

        self.commandQueue = commandQueue
        self.pipelineState = pipelineState
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

        var time = seed
        var shapeValue = shape
        var deep = palette.deep
        var mid = palette.mid
        var highlight = palette.highlight
        // The shader corrects the corona's fan for the card's proportions,
        // so a slim row and the wide folder header share one circular field.
        var aspect = Float(view.drawableSize.width / max(view.drawableSize.height, 1))
        // The seed stays frozen so the composition never moves; motion only
        // drifts the light through it, and stays zero on static cards.
        var motion = animated ? Float(CACurrentMediaTime() - startTime) : 0
        var styleValue = style.rawValue
        var bottomFadeValue = bottomFade

        encoder.setRenderPipelineState(pipelineState)
        encoder.setFragmentBytes(&time, length: MemoryLayout<Float>.size, index: 0)
        encoder.setFragmentBytes(&shapeValue, length: MemoryLayout<Float>.size, index: 1)
        encoder.setFragmentBytes(&deep, length: MemoryLayout<SIMD3<Float>>.stride, index: 2)
        encoder.setFragmentBytes(&mid, length: MemoryLayout<SIMD3<Float>>.stride, index: 3)
        encoder.setFragmentBytes(&highlight, length: MemoryLayout<SIMD3<Float>>.stride, index: 4)
        encoder.setFragmentBytes(&aspect, length: MemoryLayout<Float>.size, index: 5)
        encoder.setFragmentBytes(&motion, length: MemoryLayout<Float>.size, index: 6)
        encoder.setFragmentBytes(&styleValue, length: MemoryLayout<Float>.size, index: 7)
        encoder.setFragmentBytes(&bottomFadeValue, length: MemoryLayout<Float>.size, index: 8)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()

        buffer.present(drawable)
        buffer.commit()
    }
}
