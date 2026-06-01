import Foundation

/// Where a capture originated. The raw values are the strings the API and the
/// pending-capture queue persist, so this is used at the authoring call sites
/// (the app's inline capture, the share extension) while the lower networking
/// and persistence layers keep `String` as a passthrough boundary.
enum CaptureChannel: String {
    case app = "ios-app"
    case shareExtension = "ios-share-extension"
}
