import SwiftUI

// MARK: - Publicize drawer

/// The bottom drawer behind "Make Public" — the iOS twin of the web settings
/// panel's confirmation card. Claiming a Handle (when none exists yet) and the
/// explicit confirmation both live here: Profile Visibility becomes public
/// through one confirmed action, and the copy states that this publishes
/// nothing until a Folder is published.
struct PublicizeProfileSheet: View {
    @Environment(\.dismiss) private var dismiss
    let profileStore: ProfileStore
    let onPublicized: @MainActor () async -> Void

    @State private var isPublishing = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let profile = profileStore.profile {
                        confirmStep(handle: profile.handle)
                    } else {
                        claimStep
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 28)
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(profileStore.profile == nil ? "Choose Your Handle" : "Public Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
    }

    private var claimStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Choose a handle to hold your page address. Your handle is yours from that moment, and your profile stays private until you make it public yourself.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HandleForm(mode: .claim, profileStore: profileStore)
        }
    }

    private func confirmStep(handle: String) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Before you make your profile public")
                .font(.title3.weight(.semibold))

            VStack(alignment: .leading, spacing: 12) {
                bullet("This publishes nothing on its own. Your library stays private until you publish a folder.")
                bullet("You choose what appears. Publish a folder from its menu, and everything in it shows on your page. Remove it, and it is gone from the page at once.")
                bullet("An item you file in no folder never appears, so a save that files nothing publishes nothing.")
                bullet("Your page becomes \(HandleRules.displayProfileURL(handle: handle)). Anyone with the link can read it, and search engines can show it in their results.")
            }

            Text("You can turn this off at any time. Your page disappears immediately, and your handle stays reserved for you.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            Button(action: publish) {
                Text(isPublishing ? "Publishing…" : "Yes, make my profile public")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isPublishing)
            .padding(.top, 4)
        }
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Circle()
                .fill(.secondary)
                .frame(width: 5, height: 5)
            Text(text)
                .font(.subheadline)
        }
    }

    private func publish() {
        Task {
            isPublishing = true
            defer { isPublishing = false }
            do {
                try await profileStore.setVisibility(.public)
                dismiss()
                await onPublicized()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - Change handle

struct ChangeHandleSheet: View {
    @Environment(\.dismiss) private var dismiss
    let profileStore: ProfileStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HandleForm(mode: .rename, profileStore: profileStore) {
                        dismiss()
                    }

                    Text("Your old handle is released immediately, and anyone can then claim it. Links to your old address stop working.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 28)
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Change Handle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
    }
}

// MARK: - Handle form

/// Claim or rename a Handle with live local validation and a debounced
/// availability check — the same ladder of status lines the web form shows.
/// The server stays the authority: a submit can still be rejected, and that
/// rejection is shown in place.
struct HandleForm: View {
    enum Mode {
        case claim
        case rename
    }

    let mode: Mode
    let profileStore: ProfileStore
    var onSaved: @MainActor () -> Void = {}

    @State private var input = ""
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var availability = AvailabilityState.idle
    @State private var checkTask: Task<Void, Never>?

    private enum AvailabilityState: Equatable {
        case idle
        case checking
        case available
        case taken
        case checkFailed
    }

    private var normalized: String {
        HandleRules.normalize(input)
    }

    private var problem: String? {
        normalized.isEmpty ? nil : HandleRules.problem(normalized)
    }

    private var isOwnHandle: Bool {
        normalized == profileStore.profile?.handle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("your-handle", text: $input)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.asciiCapable)
                .font(.body.monospaced())
                .padding(.horizontal, 14)
                .frame(height: 48)
                .frame(maxWidth: .infinity)
                .background(
                    Color(uiColor: .secondarySystemBackground),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .accessibilityLabel(mode == .claim ? "Choose your handle" : "Change your handle")
                .onChange(of: input) { _, _ in
                    scheduleAvailabilityCheck()
                }

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if !normalized.isEmpty {
                    Text(HandleRules.displayProfileURL(handle: normalized))
                        .font(.footnote.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Text(statusLine)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let saveError {
                Text(saveError)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            Button(action: save) {
                Text(buttonTitle)
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSaveDisabled)
        }
    }

    private var statusLine: String {
        if let problem { return problem }
        if normalized.isEmpty { return HandleRules.hint }
        if isOwnHandle { return "This is your handle already." }

        switch availability {
        case .taken: return "Someone already has this handle. Choose another one."
        case .available: return "This handle is free."
        case .checkFailed: return "Could not check this handle. You can still try to save it."
        case .checking, .idle: return "Checking…"
        }
    }

    private var buttonTitle: String {
        if isSaving { return "Saving…" }
        return mode == .claim ? "Claim Handle" : "Save Handle"
    }

    private var isSaveDisabled: Bool {
        isSaving || normalized.isEmpty || problem != nil || availability == .taken || isOwnHandle
    }

    /// Waits out a typing pause before asking the server, and drops the answer
    /// when the input moved on while the request was in flight.
    private func scheduleAvailabilityCheck() {
        saveError = nil
        checkTask?.cancel()
        availability = .idle

        let candidate = normalized
        guard !candidate.isEmpty, problem == nil, !isOwnHandle else { return }

        checkTask = Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }

            availability = .checking
            do {
                let result = try await profileStore.checkHandleAvailability(candidate)
                guard !Task.isCancelled, candidate == normalized else { return }
                availability = result.available ? .available : .taken
            } catch {
                guard !Task.isCancelled, candidate == normalized else { return }
                availability = .checkFailed
            }
        }
    }

    private func save() {
        Task {
            isSaving = true
            defer { isSaving = false }
            do {
                switch mode {
                case .claim:
                    try await profileStore.claimHandle(normalized)
                case .rename:
                    try await profileStore.renameHandle(normalized)
                }
                onSaved()
            } catch {
                saveError = error.localizedDescription
            }
        }
    }
}
