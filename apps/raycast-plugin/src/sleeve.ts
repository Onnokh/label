import {
  showHUD,
  Clipboard,
  getPreferenceValues,
  openExtensionPreferences,
} from "@raycast/api";
import { Preferences } from "./types";

function isValidUrl(string: string): boolean {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default async function main() {
  const preferences = getPreferenceValues<Preferences>();

  if (!preferences.apiUrl || !preferences.apiKey) {
    await showHUD(
      "❌ Configuration required. Please set API URL and API Key in preferences.",
    );
    await openExtensionPreferences();
    return;
  }

  const clipboardText = await Clipboard.readText();

  if (!clipboardText) {
    await showHUD("❌ Clipboard is empty");
    return;
  }

  // Trim whitespace and check if it's a URL
  const trimmedText = clipboardText.trim();

  if (!isValidUrl(trimmedText)) {
    await showHUD("❌ Clipboard does not contain a valid URL");
    return;
  }

  try {
    await showHUD("📎 Saving to Sleeve...");

    const response = await fetch(`${preferences.apiUrl}/v1/captures`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${preferences.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: trimmedText }),
    });

    if (response.status === 201) {
      const data = (await response.json()) as { captureResult: string };
      if (data.captureResult === "created") {
        await showHUD("✅ Saved to Sleeve!");
      } else {
        await showHUD("✅ Already in Sleeve (moved to top)");
      }
    } else if (response.status === 200) {
      const data = (await response.json()) as { captureResult: string };
      if (data.captureResult === "updated") {
        await showHUD("✅ Already in Sleeve (moved to top)");
      } else {
        await showHUD("✅ Saved to Sleeve!");
      }
    } else if (response.status === 400) {
      const error = (await response.json()) as { url: string };
      await showHUD(`❌ Invalid URL: ${error.url}`);
    } else if (response.status === 401) {
      await showHUD("❌ Unauthorized. Check your API Key.");
      await openExtensionPreferences();
    } else {
      await showHUD(`❌ Failed to save (HTTP ${response.status})`);
    }
  } catch (error) {
    await showHUD(
      `❌ Network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
