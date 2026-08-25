import SwiftUI

extension AppRoute {
    /// Maps a route to its destination view. This is the one place that binds the
    /// route vocabulary to concrete feature views, so it lives in the App
    /// (composition) layer and is free to import every feature — while the
    /// `AppRoute` enum itself stays in `Core`, pushable by features that must not
    /// depend on App.
    @ViewBuilder @MainActor
    func destination(store: ReadingListStore, session: AppSession) -> some View {
        switch self {
        case .settings:
            SettingsView(session: session)
        case .folder(let id):
            if let folder = store.folders.first(where: { $0.id == id }) {
                FolderLibraryView(folder: folder, store: store)
            } else {
                ContentUnavailableView("Folder Unavailable", systemImage: "folder.badge.questionmark")
            }
        case .myProfile:
            MyProfileView(session: session)
        case .folderCardPlayground:
            FolderCardPlaygroundView()
        }
    }
}
