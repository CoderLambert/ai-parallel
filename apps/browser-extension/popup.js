const PROVIDERS = [
  { id: "chatgpt", name: "ChatGPT", default: true },
  { id: "deepseek", name: "DeepSeek", default: true },
  { id: "zhipu", name: "智谱清言", default: true },
  { id: "qwen", name: "Qwen", default: true },
  { id: "kimi", name: "Kimi", default: true },
  { id: "claude", name: "Claude", default: false },
  { id: "gemini", name: "Gemini", default: false }
];

const $ = (selector) => document.querySelector(selector);
const providerGrid = $("#providerGrid");
const promptInput = $("#promptInput");
const sendBtn = $("#sendBtn");
const selectedCount = $("#selectedCount");
const charCount = $("#charCount");
const errorBox = $("#errorBox");
const statusList = $("#statusList");

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
      await chrome.storage.local.set({ selectedProviders: [...selected] });
      updateCounters();
    });
    providerGrid.append(label);
  }
}

async function loadPreferences() {
  const data = await chrome.storage.local.get(["selectedProviders", "draftPrompt"]);
  const stored = Array.isArray(data.selectedProviders) ? data.selectedProviders : null;
  selected = new Set(stored || PROVIDERS.filter((p) => p.default).map((p) => p.id));
  promptInput.value = typeof data.draftPrompt === "string" ? data.draftPrompt : "";
  renderProviders();
  updateCounters();
}

function renderStatus(status) {
  if (!status || !status.providers || Object.keys(status.providers).length === 0) {
    statusList.className = "status-list empty";
    statusList.textContent = "暂无运行记录";
    return;
  }

  statusList.className = "status-list";
  statusList.replaceChildren();

  for (const [providerId, entry] of Object.entries(status.providers)) {
    const providerName = entry.name || PROVIDERS.find((p) => p.id === providerId)?.name || providerId;
    const item = document.createElement("div");
    item.className = "status-item";
    item.dataset.state = entry.state || "waiting";
    item.innerHTML = `
      <span class="dot"></span>
      <span>${providerName}</span>
      <span class="status-message" title="${escapeHtml(entry.message || "")}">${escapeHtml(entry.message || "")}</span>
    `;
    statusList.append(item);
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_LAST_STATUS" });
    if (response?.ok) renderStatus(response.status);
  } catch {
    // Popup remains useful even if the service worker is restarting.
  }
}

async function launch() {
  const prompt = promptInput.value.trim();
  if (!prompt) return showError("请输入 Prompt");
  if (selected.size === 0) return showError("至少选择一个模型");

  showError("");
  sendBtn.disabled = true;
  sendBtn.querySelector("span").textContent = "正在打开…";

  try {
    await chrome.storage.local.set({ draftPrompt: promptInput.value });
    const response = await chrome.runtime.sendMessage({
      type: "LAUNCH_PARALLEL",
      prompt,
      providerIds: [...selected]
    });
    if (!response?.ok) throw new Error(response?.error || "启动失败");
    await refreshStatus();
    window.close();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    sendBtn.querySelector("span").textContent = "并行发送";
    updateCounters();
  }
}

promptInput.addEventListener("input", () => {
  chrome.storage.local.set({ draftPrompt: promptInput.value }).catch(() => {});
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
  await chrome.storage.local.set({ draftPrompt: "" });
  promptInput.focus();
  updateCounters();
});

$("#toggleAllBtn").addEventListener("click", async () => {
  selected = selected.size === PROVIDERS.length
    ? new Set()
    : new Set(PROVIDERS.map((p) => p.id));
  await chrome.storage.local.set({ selectedProviders: [...selected] });
  renderProviders();
  updateCounters();
});

$("#refreshBtn").addEventListener("click", refreshStatus);
sendBtn.addEventListener("click", launch);

loadPreferences().then(refreshStatus);
