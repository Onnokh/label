import SwiftUI

struct SettingsView: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(AppSettings.self) private var appSettings
    @State private var isShowingDeleteConfirmation = false
    @State private var isDeletingAccount = false
    @State private var deleteAccountErrorMessage: String?

    let session: AppSession

    var body: some View {
        @Bindable var appSettings = appSettings
        Form {
            Section("Theme") {
                Picker("Appearance", selection: $appSettings.themePreference) {
                    ForEach(SleevyThemePreference.allCases) { theme in
                        Text(theme.title).tag(theme)
                    }
                }
                .pickerStyle(.segmented)
            }

            Section("Account") {
                LabeledContent("Name", value: session.displayName)
                LabeledContent("Email", value: session.email)
                if let providerName = session.providerName {
                    LabeledContent("Provider", value: providerName)
                }

                Button(role: .destructive) {
                    Task {
                        await authStore.signOut()
                    }
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }

            Section {
                TextField("Source name", text: $appSettings.sourceName)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.done)
                    .onSubmit(appSettings.normalizeSourceName)

                Button("Use Device Name") {
                    appSettings.resetSourceName()
                }
                .disabled(appSettings.sourceName == SleevyUserPreferences.defaultSourceName)
            } header: {
                Text("Source Name")
            } footer: {
                Text("New links saved from this iPhone will use this name as their source.")
            }

            Section {
                Button(role: .destructive) {
                    isShowingDeleteConfirmation = true
                } label: {
                    if isDeletingAccount {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Delete Account")
                            .font(.footnote)
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(isDeletingAccount)
            } footer: {
                Text("Permanently delete your account and all saved data.")
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.large)
        .onDisappear(perform: appSettings.normalizeSourceName)
        .alert("Delete Account?", isPresented: $isShowingDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete Account", role: .destructive) {
                Task {
                    isDeletingAccount = true
                    do {
                        try await authStore.deleteAccount()
                    } catch {
                        deleteAccountErrorMessage = AppConfig.userFacingNetworkMessage(for: error)
                            ?? error.localizedDescription
                    }
                    isDeletingAccount = false
                }
            }
        } message: {
            Text("This will permanently delete your account and all saved data. This cannot be undone.")
        }
        .alert("Account Deletion Failed", isPresented: Binding(
            get: { deleteAccountErrorMessage != nil },
            set: { if !$0 { deleteAccountErrorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(deleteAccountErrorMessage ?? "Please try again.")
        }
    }
}
