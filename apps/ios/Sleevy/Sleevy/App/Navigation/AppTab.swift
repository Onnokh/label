/// The tabs in the signed-in tab bar. Lives in the App layer because tabs are a
/// shell concern — unlike `AppRoute`, no feature pushes a tab.
enum AppTab: Hashable {
    case sleevy
    case library
    case search
}
