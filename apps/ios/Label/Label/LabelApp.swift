//
//  LabelApp.swift
//  Label
//
//  Created by Onno Klein Hofmeijer on 01/05/2026.
//

import SwiftUI
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

@main
struct LabelApp: App {
    @StateObject private var authStore = AuthStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authStore)
                .onOpenURL { url in
#if canImport(GoogleSignIn)
                    GIDSignIn.sharedInstance.handle(url)
#endif
                }
                .task {
                    await authStore.restoreSession()
                }
        }
    }
}
