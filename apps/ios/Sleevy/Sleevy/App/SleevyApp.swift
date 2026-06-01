//
//  SleevyApp.swift
//  Sleevy
//
//  Created by Onno Klein Hofmeijer on 01/05/2026.
//

import SwiftUI
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

@main
struct SleevyApp: App {
    @State private var authStore = AuthStore()
    @State private var appSettings = AppSettings()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authStore)
                .environment(appSettings)
                .preferredColorScheme(appSettings.preferredColorScheme)
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
