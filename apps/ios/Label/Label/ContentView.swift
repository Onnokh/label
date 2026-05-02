//
//  ContentView.swift
//  Label
//
//  Created by Onno Klein Hofmeijer on 01/05/2026.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var authStore: AuthStore

    var body: some View {
        NavigationStack {
            if let session = authStore.session {
                ReadingListView(session: session)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if authStore.isRestoringSession {
                ProgressView("Checking session...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                signedOutView
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .toolbar(authStore.session == nil ? .hidden : .visible, for: .navigationBar)
    }

    private var signedOutView: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 20) {
                Text("Save now, read later.")
                    .font(.largeTitle.bold())

                Text("Sign in with Google to sync the links you save in Label.")
                    .foregroundStyle(.secondary)

                Button {
                    Task {
                        await authStore.signInWithGoogle()
                    }
                } label: {
                    if authStore.isSigningIn {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Continue with Google")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(authStore.isSigningIn)

                if let errorMessage = authStore.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
            .padding(.top, 12)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

}

#Preview {
    ContentView()
        .environmentObject(AuthStore())
}
