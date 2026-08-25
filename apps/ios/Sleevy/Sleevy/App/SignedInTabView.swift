import SwiftUI

/// The signed-in shell: the tab bar, one navigation stack per stackable tab, and
/// the single `navigationDestination(for: AppRoute.self)` that resolves every
/// push destination through `AppRoute.destination`.
struct SignedInTabView: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.scenePhase) private var scenePhase
    let session: AppSession
    @State private var store: ReadingListStore
    @State private var profileLoader = PublicProfileLoader()
    @State private var profileStore: ProfileStore
    @State private var selectedTab: AppTab = .sleevy
    @State private var sleevyPath: [AppRoute] = []
    @State private var libraryPath: [AppRoute] = []
    @State private var shouldRefreshAfterActivation = false

    init(session: AppSession, tokenStore: SessionTokenStore) {
        self.session = session
        _store = State(wrappedValue: ReadingListStore(session: session, tokenStore: tokenStore))
        _profileStore = State(wrappedValue: ProfileStore.live(tokenStore: tokenStore))
    }

    var body: some View {
        TabView(selection: selectedTabBinding) {
            Tab("Home", systemImage: "house", value: AppTab.sleevy) {
                NavigationStack(path: $sleevyPath) {
                    ReadingListView(store: store)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accountToolbar(session: session) {
                            sleevyPath.append(.settings)
                        } onMyProfile: {
                            sleevyPath.append(.myProfile)
                        }
                        .navigationDestination(for: AppRoute.self) { route in
                            route.destination(store: store, session: session)
                        }
                        .environment(\.pushRoute) { sleevyPath.append($0) }
                }
            }

            Tab("Library", systemImage: "rectangle.stack.fill", value: AppTab.library) {
                NavigationStack(path: $libraryPath) {
                    LibraryView(store: store)
                        .accountToolbar(session: session) {
                            libraryPath.append(.settings)
                        } onMyProfile: {
                            libraryPath.append(.myProfile)
                        }
                        .navigationDestination(for: AppRoute.self) { route in
                            route.destination(store: store, session: session)
                        }
                        .environment(\.pushRoute) { libraryPath.append($0) }
                }
            }

            Tab(value: AppTab.search, role: .search) {
                NavigationStack {
                    SearchView(store: store)
                }
            }
        }
        .environment(profileLoader)
        .environment(profileStore)
        .task {
            // Folder cards suppress their published marker while the profile
            // is private, so the record must be known outside the profile page.
            await profileStore.load()
        }
        .onAppear {
            store.onAuthenticationInvalid = { message in
                authStore.invalidateSession(message: message)
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            handleScenePhaseChange(newPhase)
        }
    }

    private var selectedTabBinding: Binding<AppTab> {
        Binding {
            selectedTab
        } set: { newTab in
            selectedTab = newTab
            resetPath(for: newTab)
        }
    }

    private func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
        case .active:
            guard shouldRefreshAfterActivation else { return }
            shouldRefreshAfterActivation = false

            Task {
                await store.refresh()
            }
        case .inactive, .background:
            shouldRefreshAfterActivation = true
        @unknown default:
            break
        }
    }

    private func resetPath(for tab: AppTab) {
        switch tab {
        case .sleevy:
            sleevyPath = []
        case .library:
            libraryPath = []
        case .search:
            break
        }
    }
}

private struct AccountToolbarModifier: ViewModifier {
    @Environment(AuthStore.self) private var authStore
    let session: AppSession
    let onSettings: () -> Void
    let onMyProfile: () -> Void

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            onMyProfile()
                        } label: {
                            Label("My Profile", systemImage: "person.crop.circle")
                        }

                        Button {
                            onSettings()
                        } label: {
                            Label("Settings", systemImage: "gearshape")
                        }

                        Divider()

                        Button(role: .destructive) {
                            Task {
                                await authStore.signOut()
                            }
                        } label: {
                            Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    } label: {
                        AccountAvatarButton(
                            name: session.displayName,
                            imageURL: session.provider == .google ? authStore.googleUserProfile?.imageURL : nil
                        )
                    }
                    .accessibilityLabel("\(session.displayName) account")
                }
            }
    }
}

extension View {
    func accountToolbar(
        session: AppSession,
        onSettings: @escaping () -> Void,
        onMyProfile: @escaping () -> Void
    ) -> some View {
        modifier(AccountToolbarModifier(session: session, onSettings: onSettings, onMyProfile: onMyProfile))
    }
}
