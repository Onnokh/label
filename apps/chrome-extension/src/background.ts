const API_URL = "https://api-label.missingmounts.com";

interface Preferences {
  apiKey: string;
}

async function getPreferences(): Promise<Preferences> {
  const result = await chrome.storage.local.get(["apiKey"]);
  return {
    apiKey: result.apiKey || "",
  };
}

async function captureUrl(url: string): Promise<{ ok: boolean; message: string }> {
  const { apiKey } = await getPreferences();

  if (!apiKey) {
    return { ok: false, message: "Set your Capture Token first." };
  }

  try {
    const response = await fetch(`${API_URL}/v1/captures`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (response.status === 201 || response.status === 200) {
      return { ok: true, message: "Saved!" };
    }

    if (response.status === 400) {
      const data = (await response.json().catch(() => null)) as
        | { _tag?: string; url?: string }
        | null;
      const offending = data?.url ? `: ${data.url}` : "";
      return { ok: false, message: `Invalid URL${offending}` };
    }

    if (response.status === 401) {
      return { ok: false, message: "Unauthorized. Set your Capture Token." };
    }

    return { ok: false, message: `Failed (HTTP ${response.status})` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

async function openOptionsPage(): Promise<void> {
  await chrome.runtime.openOptionsPage();
}

const CLEAR_BADGE_ALARM = "clear-badge";

async function flashBadge(text: string, color: string): Promise<void> {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.alarms.create(CLEAR_BADGE_ALARM, { delayInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLEAR_BADGE_ALARM) {
    chrome.action.setBadgeText({ text: "" });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  await chrome.action.setBadgeText({ text: "" });

  const { apiKey } = await getPreferences();
  if (!apiKey) {
    await openOptionsPage();
    return;
  }

  const url = tab.url;
  if (!url || !url.startsWith("http")) {
    await flashBadge("!", "#e53e3e");
    return;
  }

  const result = await captureUrl(url);
  if (result.ok) {
    await flashBadge("✓", "#38a169");
  } else {
    await flashBadge("!", "#e53e3e");
  }
});

export {};
