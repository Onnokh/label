import SwiftUI

/// SwiftUI's view of the shared brandmark path. The geometry lives in
/// `Shared/SleevyBrandmarkPath` so the share extension draws the same mark.
struct SleevyBrandmark: Shape {
    func path(in rect: CGRect) -> Path {
        Path(SleevyBrandmarkPath.path(in: rect))
    }
}
