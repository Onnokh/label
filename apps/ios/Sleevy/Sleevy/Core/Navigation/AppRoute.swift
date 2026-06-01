import Foundation

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
    case folder(Folder)
    case allFolders
}
