import MetalKit
import SwiftUI

/// A picking ground for the folder card gradients. This round: ten
/// experimental fields in the Inbox aurora's language (curtains, knots,
/// added light over a near-black ground), each wearing folder palettes,
/// some square and some wide. All static — one frozen moment per card.
/// Reached from Settings in debug builds only; the shipped card keeps the
/// silk shader until a winner is chosen here.
struct FolderCardPlaygroundView: View {
    private struct LabRow: Identifiable {
        let variant: FolderCardLabVariant
        let subtitle: String
        let isWide: Bool
        let palettes: [(String, FolderCardPalette)]

        var id: Int { variant.rawValue }
    }

    private static let rows = [
        LabRow(variant: .curtain, subtitle: "the Inbox card's direct sibling", isWide: false,
               palettes: [("Red", .red), ("Neutral", .neutral)]),
        LabRow(variant: .undercurtain, subtitle: "same sheets, rising from the bottom", isWide: false,
               palettes: [("Blue", .blue), ("Orange", .orange)]),
        LabRow(variant: .horizon, subtitle: "a thin band low over the dark", isWide: true,
               palettes: [("Teal", .teal)]),
        LabRow(variant: .arc, subtitle: "an auroral bow with hanging tails", isWide: false,
               palettes: [("Purple", .purple), ("Green", .green)]),
        LabRow(variant: .ribbon, subtitle: "one folded sheet crossing at a lean", isWide: true,
               palettes: [("Pink", .pink)]),
        LabRow(variant: .picket, subtitle: "sparse distinct rays, mostly sky", isWide: false,
               palettes: [("Yellow", .yellow), ("Blue", .blue)]),
        LabRow(variant: .corona, subtitle: "rays fanning from a corner zenith — half height", isWide: true,
               palettes: [("Red", .red)]),
        LabRow(variant: .veil, subtitle: "the dimmest wash, nothing loud", isWide: false,
               palettes: [("Neutral", .neutral), ("Teal", .teal)]),
        LabRow(variant: .twinSheets, subtitle: "two curtains crossing at opposite leans", isWide: false,
               palettes: [("Orange", .orange), ("Purple", .purple)]),
        LabRow(variant: .reflection, subtitle: "a curtain over still water", isWide: true,
               palettes: [("Blue", .blue)]),
    ]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 26) {
                ForEach(Self.rows) { row in
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(row.variant.rawValue + 1). \(row.variant.title)")
                            .font(.headline)
                        Text(row.subtitle)
                            .font(.footnote)
                            .foregroundStyle(.secondary)

                        HStack(spacing: 12) {
                            ForEach(row.palettes, id: \.0) { name, palette in
                                LabFolderCard(
                                    variant: row.variant,
                                    palette: palette,
                                    aspect: aspect(for: row),
                                    name: name,
                                    itemCount: 24
                                )
                            }
                        }
                    }
                }

                coronaStack
            }
            .padding(16)
        }
        .background(Color(uiColor: .systemBackground))
        .navigationTitle("Folder Cards")
        .navigationBarTitleDisplayMode(.inline)
    }

    /// Corona runs as a slim list row; the fan is aspect-corrected in the
    /// shader, so it stays a fan.
    private func aspect(for row: LabRow) -> CGFloat {
        if row.variant == .corona { return 5.0 }
        return row.isWide ? 2.2 : 1.15
    }

    /// Row 11: how a Library of corona folders would read as a stacked list,
    /// wearing realistic names and colours.
    private var coronaStack: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("11. Corona Stack")
                .font(.headline)
            Text("five folders as a list")
                .font(.footnote)
                .foregroundStyle(.secondary)

            VStack(spacing: 12) {
                ForEach(Self.stackFolders, id: \.0) { name, palette in
                    LabFolderCard(
                        variant: .corona,
                        palette: palette,
                        aspect: 5.0,
                        name: name,
                        itemCount: 24
                    )
                }
            }
        }
    }

    private static let stackFolders: [(String, FolderCardPalette)] = [
        ("AI", .red), ("Articles", .yellow), ("Design", .blue),
        ("Libraries", .neutral), ("SEO", .teal),
    ]
}

/// The candidate card — square, wide, or slim — with the real card's text
/// layout, compacted when the card is a half-height row.
private struct LabFolderCard: View {
    let variant: FolderCardLabVariant
    let palette: FolderCardPalette
    let aspect: CGFloat
    let name: String
    let itemCount: Int

    private var isSlim: Bool { aspect >= 4 }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            FolderCardLabGradient(
                variant: variant,
                palette: palette,
                shape: FolderCardGradient.shape(for: name),
                seed: FolderCardGradient.seed(for: name)
            )

            if isSlim {
                // A true row: name left, bare count right, both centered on
                // the row's axis. No menu button — actions live on
                // long-press once this ships.
                HStack {
                    Text(name)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    Spacer()

                    Text("\(itemCount)")
                        .font(.system(size: 16, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(.white.opacity(0.7))
                }
                .padding(.horizontal, 18)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(alignment: .leading, spacing: 5) {
                    Spacer(minLength: 14)

                    Text(name)
                        .font(.system(size: 23, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    Text("\(itemCount) SAVES")
                        .font(.system(size: 13, weight: .semibold))
                        .kerning(0.5)
                        .foregroundStyle(.white.opacity(0.7))
                }
                .padding(18)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)

                Image(systemName: "ellipsis")
                    .font(.system(size: 17, weight: .semibold))
                    .rotationEffect(.degrees(90))
                    .foregroundStyle(.white.opacity(0.75))
                    .frame(width: 44, height: 44)
                    .padding(6)
            }
        }
        .aspectRatio(aspect, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

// MARK: - Lab gradient plumbing

/// The compositions `FolderCardLabShader.metal` knows how to draw. The raw
/// value is the shader's `variant` uniform.
enum FolderCardLabVariant: Int, CaseIterable, Identifiable {
    case curtain
    case undercurtain
    case horizon
    case arc
    case ribbon
    case picket
    case corona
    case veil
    case twinSheets
    case reflection

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .curtain: "Curtain"
        case .undercurtain: "Undercurtain"
        case .horizon: "Horizon"
        case .arc: "Arc"
        case .ribbon: "Ribbon"
        case .picket: "Picket"
        case .corona: "Corona"
        case .veil: "Veil"
        case .twinSheets: "Twin Sheets"
        case .reflection: "Reflection"
        }
    }
}

/// Draws one experimental field, static like the shipped card gradient.
private struct FolderCardLabGradient: UIViewRepresentable {
    let variant: FolderCardLabVariant
    let palette: FolderCardPalette
    var shape: Float = 0.5
    var seed: Float = 0

    func makeUIView(context: Context) -> FolderCardLabMetalView {
        let view = FolderCardLabMetalView()
        view.apply(variant: variant, palette: palette, shape: shape, seed: seed)
        return view
    }

    func updateUIView(_ uiView: FolderCardLabMetalView, context: Context) {
        uiView.apply(variant: variant, palette: palette, shape: shape, seed: seed)
    }
}

private final class FolderCardLabMetalView: AnimatedMetalView {
    private var renderer: FolderCardLabRenderer?

    init() {
        let device = MTLCreateSystemDefaultDevice()
        super.init(frame: .zero, device: device)

        colorPixelFormat = .bgra8Unorm
        framebufferOnly = true
        isOpaque = true
        clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        isUserInteractionEnabled = false
        shouldAnimate = false

        guard let device else { return }

        renderer = FolderCardLabRenderer(device: device)
        delegate = renderer
        rendererDidBecomeReady()
    }

    func apply(variant: FolderCardLabVariant, palette: FolderCardPalette, shape: Float, seed: Float) {
        guard
            renderer?.variant != variant
                || renderer?.palette != palette
                || renderer?.shape != shape
                || renderer?.seed != seed
        else { return }

        renderer?.variant = variant
        renderer?.palette = palette
        renderer?.shape = shape
        renderer?.seed = seed
        redrawIfPaused()
    }
}

private final class FolderCardLabRenderer: NSObject, MTKViewDelegate {
    var variant = FolderCardLabVariant.curtain
    var palette = FolderCardPalette.neutral
    var shape: Float = 0.5
    var seed: Float = 0

    private let commandQueue: MTLCommandQueue
    private let pipelineState: MTLRenderPipelineState

    init?(device: MTLDevice) {
        guard
            let queue = device.makeCommandQueue(),
            let library = device.makeDefaultLibrary(),
            let vertexFn = library.makeFunction(name: "folder_card_lab_vertex"),
            let fragmentFn = library.makeFunction(name: "folder_card_lab_fragment")
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

        var time = seed
        var variantValue = Float(variant.rawValue)
        var deep = palette.deep
        var mid = palette.mid
        var highlight = palette.highlight
        var shapeValue = shape
        var aspectValue = Float(view.drawableSize.width / max(view.drawableSize.height, 1))

        encoder.setRenderPipelineState(pipelineState)
        encoder.setFragmentBytes(&time, length: MemoryLayout<Float>.size, index: 0)
        encoder.setFragmentBytes(&variantValue, length: MemoryLayout<Float>.size, index: 1)
        encoder.setFragmentBytes(&deep, length: MemoryLayout<SIMD3<Float>>.stride, index: 2)
        encoder.setFragmentBytes(&mid, length: MemoryLayout<SIMD3<Float>>.stride, index: 3)
        encoder.setFragmentBytes(&highlight, length: MemoryLayout<SIMD3<Float>>.stride, index: 4)
        encoder.setFragmentBytes(&shapeValue, length: MemoryLayout<Float>.size, index: 5)
        encoder.setFragmentBytes(&aspectValue, length: MemoryLayout<Float>.size, index: 6)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()

        buffer.present(drawable)
        buffer.commit()
    }
}
