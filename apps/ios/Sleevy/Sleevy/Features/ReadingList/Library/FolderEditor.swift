import SwiftUI

enum FolderEditor: Identifiable {
    case create
    case rename(Folder)

    var id: String {
        switch self {
        case .create: "create"
        case .rename(let folder): "rename-\(folder.id)"
        }
    }

    var title: String {
        switch self {
        case .create: "New Folder"
        case .rename: "Edit Folder"
        }
    }

    var initialName: String {
        switch self {
        case .create: ""
        case .rename(let folder): folder.name
        }
    }

    var initialEmoji: String? {
        switch self {
        case .create: nil
        case .rename(let folder): folder.emoji
        }
    }

    var initialColor: FolderAccentColor? {
        switch self {
        case .create: nil
        case .rename(let folder): FolderAccentColor(rawValue: folder.color ?? "")
        }
    }
}

struct FolderEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let editor: FolderEditor
    let onSave: @MainActor (FolderDraft) async throws -> Void
    @State private var name: String
    /// No longer editable — carried through so a rename never clears an
    /// emoji a folder already has from before the picker was removed.
    @State private var selectedEmoji: String?
    @State private var selectedColor: FolderAccentColor?
    @State private var errorMessage: String?
    @State private var isSaving = false

    init(editor: FolderEditor, onSave: @escaping @MainActor (FolderDraft) async throws -> Void) {
        self.editor = editor
        self.onSave = onSave
        _name = State(initialValue: editor.initialName)
        _selectedEmoji = State(initialValue: editor.initialEmoji)
        _selectedColor = State(initialValue: editor.initialColor)
    }

    var body: some View {
        FolderEditorDrawer(
            title: editor.title,
            isSaveDisabled: trimmedName.isEmpty || name.count > 80 || isSaving,
            onCancel: { dismiss() },
            onSave: save
        ) {
            VStack(spacing: 22) {
                TextField("Folder name", text: $name)
                    .textInputAutocapitalization(.words)
                    .font(.body)
                    .padding(.horizontal, 14)
                    .frame(height: 48)
                    .frame(maxWidth: .infinity)
                    .background(
                        Color(uiColor: .secondarySystemBackground),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                    )
                    .padding(.top, 14)

                colorPicker

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .presentationDetents([.height(330), .large])
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func save() {
        Task {
            isSaving = true
            defer { isSaving = false }
            do {
                try await onSave(FolderDraft(
                    name: trimmedName,
                    emoji: selectedEmoji,
                    color: selectedColor
                ))
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private var colorPicker: some View {
        FolderPickerSection(title: "Color") {
            Text("Color")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)

            LazyVGrid(columns: Self.optionGridColumns, spacing: 10) {
                optionButton(isSelected: selectedColor == nil) {
                    Image(systemName: "nosign")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                } action: {
                    selectedColor = nil
                }

                ForEach(FolderAccentColor.allCases) { color in
                    Button {
                        selectedColor = color
                    } label: {
                        Circle()
                            .fill(color.tint.gradient)
                            .frame(width: 28, height: 28)
                            .frame(width: 44, height: 44)
                            .overlay {
                                if selectedColor == color {
                                    Circle()
                                        .stroke(color.tint, lineWidth: 2)
                                        .frame(width: 36, height: 36)
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(color.title)
                }
            }
        }
    }

    private static let optionGridColumns = [
        GridItem(.adaptive(minimum: 44, maximum: 48), spacing: 10)
    ]

    @ViewBuilder
    private func optionButton<Content: View>(
        isSelected: Bool,
        @ViewBuilder content: () -> Content,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            content()
                .frame(width: 44, height: 44)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(isSelected ? Color.accentColor.opacity(0.14) : Color(uiColor: .secondarySystemBackground))
                )
                .overlay {
                    if isSelected {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(Color.accentColor.opacity(0.45), lineWidth: 1)
                    }
                }
        }
        .buttonStyle(.plain)
    }

}

private struct FolderEditorDrawer<Content: View>: View {
    let title: String
    let isSaveDisabled: Bool
    let onCancel: () -> Void
    let onSave: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        NavigationStack {
            ScrollView {
                content
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: onSave)
                        .disabled(isSaveDisabled)
                }
            }
        }
    }
}

private struct FolderPickerSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }
}

struct FolderDraft {
    let name: String
    let emoji: String?
    let color: FolderAccentColor?
}

enum FolderAccentColor: String, CaseIterable, Identifiable {
    case blue
    case purple
    case pink
    case red
    case orange
    case yellow
    case green
    case teal

    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    var tint: Color {
        switch self {
        case .blue: .blue
        case .purple: .purple
        case .pink: .pink
        case .red: .red
        case .orange: .orange
        case .yellow: .yellow
        case .green: .green
        case .teal: .teal
        }
    }

    /// The gradient palette a folder card wears for this accent colour.
    var cardPalette: FolderCardPalette {
        switch self {
        case .blue: .blue
        case .purple: .purple
        case .pink: .pink
        case .red: .red
        case .orange: .orange
        case .yellow: .yellow
        case .green: .green
        case .teal: .teal
        }
    }
}
