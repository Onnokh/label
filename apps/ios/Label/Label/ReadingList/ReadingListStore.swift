import Combine
import Foundation
import UIKit

@MainActor
final class ReadingListStore: ObservableObject {
    @Published private(set) var savedItems: [SavedItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isRefreshing = false
    @Published var errorMessage: String?

    private let session: AppSession
    private let decoder: JSONDecoder

    init(session: AppSession) {
        self.session = session
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
    }

    func loadIfNeeded() async {
        guard savedItems.isEmpty, !isLoading else { return }
        await load()
    }

    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        await performLoad()
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        await performLoad()
    }

    func markOpened(_ item: SavedItem) async {
        guard let url = URL(string: item.originalURL) else { return }

        do {
            let updated = try await request(
                path: "/v1/saved-items/\(item.id)/open",
                method: "POST",
                responseType: SavedItem.self
            )

            if let index = savedItems.firstIndex(where: { $0.id == updated.id }) {
                savedItems[index] = updated
            }

            await MainActor.run {
                UIApplication.shared.open(url)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(_ item: SavedItem) async {
        do {
            try await requestNoContent(path: "/v1/saved-items/\(item.id)", method: "DELETE")
            savedItems.removeAll { $0.id == item.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func performLoad() async {
        do {
            let response = try await request(
                path: "/v1/saved-items",
                responseType: SavedItemsResponse.self
            )
            savedItems = response.savedItems
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func request<T: Decodable>(
        path: String,
        method: String = "GET",
        responseType: T.Type
    ) async throws -> T {
        var request = URLRequest(url: AppConfig.endpoint(path))
        request.httpMethod = method
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidServerResponse
        }

        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            throw messageError(data: data, fallback: "Request failed with status \(httpResponse.statusCode).")
        }

        return try decoder.decode(responseType, from: data)
    }

    private func requestNoContent(path: String, method: String) async throws {
        var request = URLRequest(url: AppConfig.endpoint(path))
        request.httpMethod = method
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidServerResponse
        }

        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            throw messageError(data: data, fallback: "Request failed with status \(httpResponse.statusCode).")
        }
    }

    private func messageError(data: Data, fallback: String) -> Error {
        if
            let body = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !body.isEmpty
        {
            return AuthError.authenticationFailed(body)
        }

        return AuthError.authenticationFailed(fallback)
    }
}
