//
//  ContentView.swift
//  Sleevy
//
//  Created by Onno Klein Hofmeijer on 01/05/2026.
//

import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var authStore: AuthStore

    var body: some View {
        if let session = authStore.session {
            SignedInTabView(session: session)
        } else {
            NavigationStack {
                if authStore.isRestoringSession {
                    ProgressView("Checking session...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    signedOutView
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var signedOutView: some View {
        ZStack {
            MetalGradientBackground()
                .ignoresSafeArea()

            FloatingBokehView()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                SleevyBrandmark()
                    .fill(.white)
                    .frame(width: 80, height: 120)
                    .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
                    .padding(.bottom, 48)

                VStack(spacing: 14) {

                    Button {
                        Task { await authStore.signInWithApple() }
                    } label: {
                        if authStore.isSigningIn {
                            ProgressView()
                                .tint(.black)
                                .frame(maxWidth: .infinity, minHeight: 22)
                        } else {
                            Label("Continue with Apple", systemImage: "apple.logo")
                                .frame(maxWidth: .infinity, minHeight: 22)
                        }
                    }
                    .buttonStyle(LandingButtonStyle(variant: .primary))
                    .disabled(authStore.isSigningIn)

                    Button {
                        Task { await authStore.signInWithGoogle() }
                    } label: {
                        if authStore.isSigningIn {
                            ProgressView()
                                .tint(.white)
                                .frame(maxWidth: .infinity, minHeight: 22)
                        } else {
                            HStack(spacing: 8) {
                                Image("GoogleLogo")
                                    .resizable()
                                    .scaledToFit()
                                    .frame(width: 18, height: 18)
                                    .accessibilityHidden(true)
                                Text("Continue with Google")
                            }
                                .frame(maxWidth: .infinity, minHeight: 22)
                        }
                    }
                    .buttonStyle(LandingButtonStyle(variant: .secondary))
                    .disabled(authStore.isSigningIn)
                }
                .padding(.horizontal, 32)

                if let errorMessage = authStore.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.white)
                        .padding(.top, 12)
                }

                Spacer()
            }
        }
    }
}

private struct SignedInTabView: View {
    @EnvironmentObject private var authStore: AuthStore
    @Environment(\.scenePhase) private var scenePhase
    let session: AppSession
    @StateObject private var store: ReadingListStore
    @State private var selectedTab: SignedInTab = .sleevy
    @State private var sleevyPath: [SignedInRoute] = []
    @State private var libraryPath: [SignedInRoute] = []
    @State private var shouldRefreshAfterActivation = false

    init(session: AppSession) {
        self.session = session
        _store = StateObject(wrappedValue: ReadingListStore(session: session))
    }

    var body: some View {
        TabView(selection: selectedTabBinding) {
            Tab("Home", systemImage: "house", value: SignedInTab.sleevy) {
                NavigationStack(path: $sleevyPath) {
                    ReadingListView(store: store)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accountToolbar(session: session) {
                            sleevyPath.append(.settings)
                        }
                        .navigationDestination(for: SignedInRoute.self) { route in
                            route.makeView(session: session)
                        }
                }
            }

            Tab("Library", systemImage: "rectangle.stack.fill", value: SignedInTab.library) {
                NavigationStack(path: $libraryPath) {
                    LibraryView(store: store)
                        .accountToolbar(session: session) {
                            libraryPath.append(.settings)
                        }
                        .navigationDestination(for: SignedInRoute.self) { route in
                            route.makeView(session: session)
                        }
                }
            }

            Tab(value: SignedInTab.search, role: .search) {
                NavigationStack {
                    SearchView(store: store)
                }
            }
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

    private var selectedTabBinding: Binding<SignedInTab> {
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

    private func resetPath(for tab: SignedInTab) {
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

private enum SignedInTab: Hashable {
    case sleevy
    case library
    case search
}

private enum SignedInRoute: Hashable {
    case settings

    @ViewBuilder
    func makeView(session: AppSession) -> some View {
        switch self {
        case .settings:
            SettingsView(session: session)
        }
    }
}

private struct AccountToolbarModifier: ViewModifier {
    @EnvironmentObject private var authStore: AuthStore
    let session: AppSession
    let onSettings: () -> Void

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
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
                            imageURL: session.provider == "google" ? authStore.googleUserProfile?.imageURL : nil
                        )
                    }
                    .accessibilityLabel("\(session.displayName) account")
                }
            }
    }
}

private extension View {
    func accountToolbar(session: AppSession, onSettings: @escaping () -> Void) -> some View {
        modifier(AccountToolbarModifier(session: session, onSettings: onSettings))
    }
}

private struct LandingButtonStyle: ButtonStyle {
    enum Variant { case primary, secondary }
    let variant: Variant

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(variant == .primary ? Color.black : Color.white)
            .padding(.vertical, 16)
            .background(
                variant == .primary
                    ? AnyShapeStyle(Color.white)
                    : AnyShapeStyle(Color.white.opacity(0.2))
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Color.white.opacity(variant == .secondary ? 0.3 : 0), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.8 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthStore())
}
