import MetalKit

/// Shared render-loop policy for the app's slowly animated Metal fields.
///
/// The shaders keep their original coordinates and output. The view saves GPU
/// work by rendering the soft fields at a lower internal scale, sampling their
/// slow motion less often, and stopping completely while they are not visible.
class AnimatedMetalView: MTKView {
    private static let renderScale: CGFloat = 2

    var shouldAnimate = true {
        didSet {
            guard shouldAnimate != oldValue else { return }
            updatePlaybackState()
        }
    }

    private var powerStateObserver: NSObjectProtocol?

    override init(frame frameRect: CGRect, device: MTLDevice?) {
        super.init(frame: frameRect, device: device)

        contentScaleFactor = Self.renderScale
        preferredFramesPerSecond = 15
        enableSetNeedsDisplay = true
        isPaused = true

        powerStateObserver = NotificationCenter.default.addObserver(
            forName: .NSProcessInfoPowerStateDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.updatePlaybackState()
        }
    }

    @available(*, unavailable)
    required init(coder: NSCoder) {
        fatalError("AnimatedMetalView is created in code, never from a nib.")
    }

    deinit {
        if let powerStateObserver {
            NotificationCenter.default.removeObserver(powerStateObserver)
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        updatePlaybackState()
        redrawIfPaused()
    }

    func rendererDidBecomeReady() {
        updatePlaybackState()
        redrawIfPaused()
    }

    func redrawIfPaused() {
        guard isPaused, window != nil else { return }
        setNeedsDisplay()
    }

    private func updatePlaybackState() {
        let canAnimate = shouldAnimate
            && window != nil
            && !ProcessInfo.processInfo.isLowPowerModeEnabled

        guard isPaused == canAnimate else { return }
        isPaused = !canAnimate
    }
}
