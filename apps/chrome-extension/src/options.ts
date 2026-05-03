const apiKeyInput = document.getElementById(
  "api-key",
) as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const clearButton = document.getElementById("clear") as HTMLButtonElement;
const feedback = document.getElementById("feedback") as HTMLDivElement;

function showFeedback(message: string, type: "success" | "error") {
  feedback.textContent = message;
  feedback.className = `feedback ${type}`;
  setTimeout(() => {
    feedback.textContent = "";
    feedback.className = "feedback";
  }, 3000);
}

async function loadPreferences() {
  const result = await chrome.storage.local.get(["apiKey"]);
  apiKeyInput.value = result.apiKey || "";
}

async function savePreferences() {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showFeedback("Capture Token is required.", "error");
    return;
  }

  await chrome.storage.local.set({ apiKey });
  showFeedback("Saved!", "success");
}

async function clearPreferences() {
  await chrome.storage.local.remove(["apiUrl", "apiKey"]);
  apiKeyInput.value = "";
  showFeedback("Cleared.", "success");
}

saveButton.addEventListener("click", savePreferences);
clearButton.addEventListener("click", clearPreferences);
loadPreferences();
