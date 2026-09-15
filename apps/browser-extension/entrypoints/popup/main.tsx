import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import type { ProviderId } from "../../contracts/provider";
import "../../shared/provider-catalog.js";
import "../../shared/contract-runtime.js";
import "../../shared/storage-contract.js";
import { Badge } from "../../ui/components/badge";
import { Button } from "../../ui/components/button";
import { Card, CardContent, CardHeader } from "../../ui/components/card";
import { Input } from "../../ui/components/input";
import { Textarea } from "../../ui/components/textarea";
import "../../ui/theme.css";
import "./popup.css";

const providers = globalThis.AIParallelProviderCatalog;
const contractRuntime = globalThis.AIParallelContractRuntime;
const storage = globalThis.AIParallelStorageContract.createLocalStorage();

function extensionUrl(path: string) {
  const runtime = browser.runtime as typeof browser.runtime & { getURL: (value: string) => string };
  return runtime.getURL(path);
}

function providerIdsFrom(value: unknown): ProviderId[] | null {
  if (!Array.isArray(value)) return null;
  const known = new Set(providers.map((provider) => provider.id));
  return value.filter((id): id is ProviderId => typeof id === "string" && known.has(id as ProviderId));
}

function PopupApp() {
  const [selected, setSelected] = useState<ProviderId[]>([]);
  const [draft, setDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allSelected = selected.length === providers.length;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    let active = true;
    storage.get(["selectedProviders", "draftPrompt"]).then((data) => {
      if (!active) return;
      setSelected(providerIdsFrom(data.selectedProviders) || providers.filter((provider) => provider.default).map((provider) => provider.id));
      setDraft(typeof data.draftPrompt === "string" ? data.draftPrompt : "");
      setHydrated(true);
    }).catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : String(reason));
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    storage.set({ selectedProviders: selected }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [hydrated, selected]);

  function toggleProvider(providerId: ProviderId) {
    setSelected((current) => current.includes(providerId)
      ? current.filter((id) => id !== providerId)
      : [...current, providerId]);
    setError("");
  }

  function toggleAll() {
    setSelected(allSelected ? [] : providers.map((provider) => provider.id));
    setError("");
  }

  async function launch() {
    const prompt = draft.trim();
    if (!prompt) return setError("请输入 Prompt");
    if (!selected.length) return setError("至少选择一个模型");
    setBusy(true);
    setError("");
    try {
      await storage.set({
        draftPrompt: draft,
        selectedProviders: selected,
        pendingLaunch: { prompt, providerIds: selected, queuedAt: new Date().toISOString() }
      });
      const request = { type: "OPEN_WORKSPACE" } as const;
      if (!contractRuntime.isServiceWorkerRequest(request)) throw new Error("Invalid workspace request");
      const response = await browser.runtime.sendMessage(request) as { ok?: boolean; error?: string };
      if (!contractRuntime.isServiceWorkerResponse(response)) throw new Error("Invalid workspace response");
      if (!response.ok) throw new Error(response.error || "启动失败");
      window.close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function openTemplateLibrary() {
    try {
      await browser.tabs.create({ url: extensionUrl("templates.html") });
      window.close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function clearDraft() {
    setDraft("");
    setError("");
    storage.set({ draftPrompt: "" }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }

  return (
    <main className="popup-app">
      <header className="popup-header">
        <div>
          <div className="popup-eyebrow">AI PARALLEL LAUNCHER</div>
          <h1>一次提问，多模型并行</h1>
          <p>使用已登录的模型网页会话，在 Workspace 中并行执行。</p>
        </div>
        <Button variant="ghost" size="sm" onClick={clearDraft} aria-label="清空输入">清空</Button>
      </header>

      <Card>
        <CardHeader className="popup-section-head">
          <span>模型</span>
          <Button variant="ghost" size="sm" onClick={toggleAll}>{allSelected ? "取消全选" : "全选"}</Button>
        </CardHeader>
        <CardContent className="provider-grid" aria-label="模型选择">
          {providers.map((provider) => {
            const checked = selectedSet.has(provider.id);
            return (
              <button
                key={provider.id}
                type="button"
                role="checkbox"
                aria-checked={checked}
                className={`provider-option${checked ? " is-selected" : ""}`}
                onClick={() => toggleProvider(provider.id)}
              >
                <span className="provider-mark" aria-hidden="true">{checked ? "✓" : ""}</span>
                <span>{provider.name}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <section className="popup-composer" aria-label="Prompt 输入">
        <Textarea
          value={draft}
          rows={8}
          autoFocus
          placeholder="输入你想同时发送给多个模型的 Prompt…"
          onChange={(event) => {
            setDraft(event.target.value);
            setError("");
            storage.set({ draftPrompt: event.target.value }).catch(() => {});
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              void launch();
            }
          }}
        />
        <div className="composer-meta">
          <span>{draft.length} 字符</span>
          <span>Ctrl / ⌘ + Enter 发送</span>
        </div>
      </section>

      {error && <div className="popup-error" role="alert">{error}</div>}

      <Button className="send-button" size="lg" disabled={busy || !hydrated} onClick={() => void launch()}>
        {busy ? "正在打开…" : "并行发送"}
        <Badge>{selected.length}</Badge>
      </Button>

      <Button className="templates-button" variant="outline" onClick={() => void openTemplateLibrary()}>
        打开 Prompt Template Library
      </Button>

      <footer>Prompt 仅保存在浏览器扩展本地存储中，不写入 URL。</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<PopupApp />);
