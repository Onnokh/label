//
//  ContentView.swift
//  Sleevy
//
//  Created by Onno Klein Hofmeijer on 01/05/2026.
//

import SwiftUI
import UIKit

struct ContentView: View {
    @Environment(AuthStore.self) private var authStore

    var body: some View {
        if let session = authStore.session {
            SignedInTabView(session: session, tokenStore: authStore.tokenStore)
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
        .environment(AuthStore())
}
