const PROVIDERS = globalThis.AIParallelProviderCatalog;
const contractRuntime = globalThis.AIParallelContractRuntime;
const storage = globalThis.AIParallelStorageContract.createLocalStorage();

const $ = (selector) => document.querySelector(selector);
const providerGrid = $("#providerGrid");
const promptInput = $("#promptInput");
const sendBtn = $("#sendBtn");
const selectedCount = $("#selectedCount");
const charCount = $("#charCount");
const errorBox = $("#errorBox");

let selected = new Set();

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function updateCounters() {
  selectedCount.textContent = String(selected.size);
  charCount.textContent = `${promptInput.value.length} 字符`;
  sendBtn.disabled = selected.size === 0 || promptInput.value.trim().length === 0;
}

function renderProviders() {
  providerGrid.replaceChildren();
  for (const provider of PROVIDERS) {
    const label = document.createElement("label");
    label.className = "provider";
    label.dataset.checked = String(selected.has(provider.id));
    label.innerHTML = `
      <input type="checkbox" value="${provider.id}" ${selected.has(provider.id) ? "checked" : ""} />
      <span class="mark">${selected.has(provider.id) ? "✓" : ""}</span>
      <span class="name">${provider.name}</span>
    `;
    const input = label.querySelector("input");
    input.addEventListener("change", async () => {
      if (input.checked) selected.add(provider.id);
      else selected.delete(provider.id);
      label.dataset.checked = String(input.checked);
      label.querySelector(".mark").textContent = input.checked ? "✓" : "";
      await storage.set({ selectedProviders: [...selected] });
      updateCounters();
    });
    providerGrid.append(label);
  }
}

async function loadPreferences() {
  const data = await storage.get(["selectedProviders", "draftPrompt"]);
  const stored = Array.isArray(data.selectedProviders)
    ? data.selectedProviders.filter((id) => PROVIDERS.some((provider) => provider.id === id))
    : null;
  selected = new Set(stored || PROVIDERS.filter((p) => p.default).map((p) => p.id));
  promptInput.value = typeof data.draftPrompt === "string" ? data.draftPrompt : "";
  renderProviders();
  updateCounters();
}

async function launch() {
  const prompt = promptInput.value.trim();
  if (!prompt) return showError("请输入 Prompt");
  if (selected.size === 0) return showError("至少选择一个模型");

  showError("");
  sendBtn.disabled = true;
  sendBtn.querySelector("span").textContent = "正在打开…";

  try {
    await storage.set({
      draftPrompt: promptInput.value,
      selectedProviders: [...selected],
      pendingLaunch: {
        prompt,
        providerIds: [...selected],
        queuedAt: new Date().toISOString()
      }
    });
    const request = { type: "OPEN_WORKSPACE" };
    if (!contractRuntime.isServiceWorkerRequest(request)) throw new Error("Invalid workspace request");
    const response = await chrome.runtime.sendMessage(request);
    if (!contractRuntime.isServiceWorkerResponse(response)) throw new Error("Invalid workspace response");
    if (!response?.ok) throw new Error(response?.error || "启动失败");
    window.close();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    sendBtn.querySelector("span").textContent = "并行发送";
    updateCounters();
  }
}

promptInput.addEventListener("input", () => {
  storage.set({ draftPrompt: promptInput.value }).catch(() => {});
  showError("");
  updateCounters();
});

promptInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    launch();
  }
});

$("#clearBtn").addEventListener("click", async () => {
  promptInput.value = "";
  await storage.set({ draftPrompt: "" });
  promptInput.focus();
  updateCounters();
});

$("#toggleAllBtn").addEventListener("click", async () => {
  selected = selected.size === PROVIDERS.length
    ? new Set()
    : new Set(PROVIDERS.map((p) => p.id));
  await storage.set({ selectedProviders: [...selected] });
  renderProviders();
  updateCounters();
});

sendBtn.addEventListener("click", launch);

loadPreferences();
