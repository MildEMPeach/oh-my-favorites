import { testConnection } from "./api.js";
import { getConfig, saveConfig, validateApiUrl } from "./config.js";

const form = requireElement<HTMLFormElement>("#settings-form");
const apiUrlInput = requireElement<HTMLInputElement>("#api-url");
const apiTokenInput = requireElement<HTMLInputElement>("#api-token");
const status = requireElement<HTMLDivElement>("#status");

void load();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveAndTest();
});

async function load() {
  const config = await getConfig();
  apiUrlInput.value = config.apiUrl;
  apiTokenInput.value = config.apiToken;
}

async function saveAndTest() {
  status.className = "status pending";
  status.textContent = "Checking connection…";

  try {
    const config = {
      apiUrl: validateApiUrl(apiUrlInput.value.trim()),
      apiToken: apiTokenInput.value.trim()
    };
    if (!config.apiToken) throw new Error("API token is required.");

    await testConnection(config);
    await saveConfig(config);
    apiUrlInput.value = config.apiUrl;
    status.className = "status success";
    status.textContent = "Connected. Click the extension icon on any page to save it.";
  } catch (cause) {
    status.className = "status error";
    status.textContent = cause instanceof Error ? cause.message : "Connection failed.";
  }
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Options page is missing ${selector}.`);
  return element;
}
