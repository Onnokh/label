---
name: app-store-localization
description: Add an App Store locale to Sleevy, translate its metadata and screenshot copy, render the iPhone and iPad PNGs, and synchronize the locale's four screenshot sets with App Store Connect through asc. Use when a user asks to fill a new App Store language, localize App Store metadata, generate localized marketing screenshots, or upload those screenshots to ASC.
homepage: https://developer.apple.com/help/app-store-connect/
license: UNLICENSED
---

# Sleevy App Store localization

Run this workflow from the repository root. It has two sources of truth:

- 'metadata/' contains App Store metadata JSON.
- 'scripts/app-store-screenshots/translations.json' contains screenshot copy; 'scripts/app-store-screenshots/render.mjs' creates both device families.

The deliverable is one complete locale: valid metadata, five iPhone PNGs, five iPad PNGs, and matching App Store Connect records.

## 1. Establish the target

Read 'AGENTS.md' and 'CONTEXT.md', then inspect the worktree:

~~~sh
git status --short
asc apps list --output table
asc versions list --app "$APP_ID" --output table
~~~

Resolve the App Store app ID, version ID, version string, and Apple locale from ASC. Keep the screenshot key separate when it differs from the Apple locale ('nl-NL' → 'nl', for example). Check the locale catalog and existing localizations:

~~~sh
asc localizations supported-locales --version "$VERSION_ID" --output table
asc localizations list --version "$VERSION_ID" --output table
asc localizations list --app "$APP_ID" --type app-info --output table
~~~

Create a missing version localization with 'asc localizations create --version "$VERSION_ID" --locale "$APPLE_LOCALE"'. Create or update the matching app-info localization with 'asc app-setup info set --app "$APP_ID" --locale "$APPLE_LOCALE" --name "$NAME" --subtitle "$SUBTITLE"'. Then resolve the version localization ID with 'asc apps info view --version-id "$VERSION_ID"' and the app-info localization ID with 'asc apps info view --app "$APP_ID" --include appInfoLocalizations'.

Completion criterion: the target app, version, Apple locale, screenshot key, version localization ID, and app-info localization ID are recorded from ASC output rather than guessed.

## 2. Pull and fill metadata

Pull the canonical files into a clean metadata directory:

~~~sh
asc metadata pull --app "$APP_ID" --version "$VERSION" --platform IOS --dir metadata
~~~

Create or update:

- 'metadata/app-info/<apple-locale>.json': 'name', 'subtitle', 'privacyPolicyUrl', 'privacyChoicesUrl', and 'privacyPolicyText' when the request includes Apple TV Privacy Policy.
- 'metadata/version/<version>/<apple-locale>.json': 'description', 'keywords', 'marketingUrl', 'promotionalText', 'supportUrl', and 'whatsNew'.

Translate every requested field. Keep the Apple limits visible while editing: name 30 characters, subtitle 30, keywords 100 comma-separated characters, promotional text 170, description and What's New 4000 each. Preserve URLs that are not actually localized; use a locale-specific URL only after verifying that it exists.

For screenshot 01, keep 'oneTap' to two short lines in 'translations.json'. Short copy should fit at the configured headline size; prefer a concise equivalent over shrinking a long sentence.

Completion criterion: 'asc metadata validate --dir metadata --output table' reports zero errors and zero warnings, and every requested metadata field appears in the target locale file.

## 3. Add and render screenshot copy

Add the target screenshot key to 'scripts/app-store-screenshots/translations.json'. Keep all keys present in the existing English object: 'oneTap', 'organize', 'folders', 'saveNow', 'readReady', 'oneHandle', 'publish', 'workflow', 'alreadyThere', 'browser', 'chrome', 'launcher', 'raycast', 'phone', and 'nativeShare'.

Render English and the new locale together so the output remains comparable:

~~~sh
node scripts/app-store-screenshots/render.mjs en "$SCREENSHOT_LOCALE"
~~~

Inspect 'app-store-screenshots/iphone/<locale>/01.png' and 'app-store-screenshots/ipad/<locale>/01.png'. Confirm the two-line headline stays large, centered, and comfortably inside its safe area. Inspect at least one long translated line from 03–05 to confirm proportional fitting remains legible.

Completion criterion: all four directories exist and contain five PNGs: 'iphone/en', 'iphone/<locale>', 'ipad/en', and 'ipad/<locale>'.

## 4. Validate local assets

Use the device types accepted by ASC:

~~~sh
asc screenshots validate --path app-store-screenshots/iphone/en --device-type IPHONE_65 --output table
asc screenshots validate --path app-store-screenshots/iphone/<locale> --device-type IPHONE_65 --output table
asc screenshots validate --path app-store-screenshots/ipad/en --device-type IPAD_PRO_3GEN_129 --output table
asc screenshots validate --path app-store-screenshots/ipad/<locale> --device-type IPAD_PRO_3GEN_129 --output table
~~~

Each report must show five ready files, zero errors, and zero warnings. A failed validation is a red state: fix dimensions or copy before any ASC mutation.

Completion criterion: all four reports are green with '5/5' ready files.

## 5. Apply metadata, then prepare screenshot replacement

Preview and apply metadata with the canonical workflow:

~~~sh
asc metadata push --app "$APP_ID" --version "$VERSION" --platform IOS --dir metadata --dry-run --output table
asc metadata push --app "$APP_ID" --version "$VERSION" --platform IOS --dir metadata --output table
~~~

Check the version state before replacing screenshots:

~~~sh
asc versions list --app "$APP_ID" --output table
~~~

A screenshot replacement requires an editable version in 'PREPARE_FOR_SUBMISSION'. If the version is 'READY_FOR_REVIEW', pause and ask the user to remove it from review; retain the generated local assets and applied metadata, then resume after ASC reports 'PREPARE_FOR_SUBMISSION'.

Completion criterion: metadata push reports success for the target locale, and the version state is confirmed editable before screenshot upload.

## 6. Replace all four screenshot sets

Preview every replacement first:

~~~sh
asc screenshots upload --version-localization "$EN_LOCALIZATION_ID" --path app-store-screenshots/iphone/en --device-type IPHONE_65 --replace --dry-run --output table
asc screenshots upload --version-localization "$LOCALE_LOCALIZATION_ID" --path app-store-screenshots/iphone/<locale> --device-type IPHONE_65 --replace --dry-run --output table
asc screenshots upload --version-localization "$EN_LOCALIZATION_ID" --path app-store-screenshots/ipad/en --device-type IPAD_PRO_3GEN_129 --replace --dry-run --output table
asc screenshots upload --version-localization "$LOCALE_LOCALIZATION_ID" --path app-store-screenshots/ipad/<locale> --device-type IPAD_PRO_3GEN_129 --replace --dry-run --output table
~~~

After reviewing that each plan deletes five old files and uploads five new files, run the same commands with '--confirm' instead of '--dry-run', one set at a time. ASC uploads can outlive the command's first output; wait for the process to finish before starting the next set. When output stalls, inspect the process and query the set before retrying so a second replacement cannot create duplicates or leave a partial set.

Completion criterion: each upload reports five uploaded files with no pending or failed assets.

## 7. Verify remote state

List each localization's sets and confirm both device families contain exactly five 'COMPLETE' screenshots:

~~~sh
asc screenshots list --version-localization "$EN_LOCALIZATION_ID" --output json
asc screenshots list --version-localization "$LOCALE_LOCALIZATION_ID" --output json
asc apps info view --version-id "$VERSION_ID" --output json
asc apps info view --app "$APP_ID" --include appInfoLocalizations --output json
~~~

Verify the target locale's name, subtitle, privacy fields, keywords, and screenshot counts against the local files. If a replacement is interrupted, clean up the exact pending asset ID reported by ASC and restore a complete set before continuing.

Completion criterion: English and the target locale each have an iPhone set and an iPad set with five 'COMPLETE' assets, and remote metadata matches the intended local values.

## 8. Commit the recipe and outputs

Review the diff and commit the local source, metadata, and generated PNGs. Keep unrelated files such as 'captures/' out of the commit:

~~~sh
git diff --check
git add metadata scripts/app-store-screenshots/translations.json app-store-screenshots/iphone app-store-screenshots/ipad
git commit -m "feat: add <locale> App Store localization"
git status --short
~~~

Completion criterion: the commit contains the locale source, metadata, and generated screenshot outputs; the remaining worktree changes are unrelated and explicitly preserved.
