import SwiftUI

/// Every push destination in the signed-in navigation stacks, enumerated in one
/// place. This is pure *vocabulary*: feature views push these values with
/// `NavigationLink(value:)`, and the stacks resolve them via a single
/// `navigationDestination(for: AppRoute.self)`.
///
/// It lives in `Core` (not `App`) on purpose — feature views depend on it to
/// navigate, so it must sit below them. The mapping from a route to its actual
/// view constructs feature views and therefore lives in the composition layer
/// instead (`AppRoute.destination(store:session:)` in `App/Navigation`), keeping
/// `Core` free of any dependency on `Features`.
enum AppRoute: Hashable {
    case settings
    case folder(id: Folder.ID)
    case allFolders
    case myProfile
}

extension EnvironmentValues {
    /// Pushes a route onto the enclosing tab's navigation stack. For views
    /// that cannot be a `NavigationLink` — a `List` decorates every labeled
    /// link with a disclosure chevron and forwards row taps to an arbitrary
    /// one when several share a row, as the folder cards grid does.
    @Entry var pushRoute: @MainActor (AppRoute) -> Void = { _ in }
}
