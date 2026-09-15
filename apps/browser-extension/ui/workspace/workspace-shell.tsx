import { useEffect, useState } from "react";
import type { ProviderDescriptor, ProviderId } from "../../contracts/provider";
import { Button } from "../components/button";
import { ProviderStrip } from "./features/provider-strip";
import { WorkspaceActions, type WorkspaceAction } from "./features/workspace-actions";

const providers = globalThis.AIParallelProviderCatalog;
const storage = globalThis.AIParallelStorageContract.createLocalStorage();
const legacyActionIds: Record<WorkspaceAction, string> = {
  session: "sessionBtn",
  prompt: "promptLibraryBtn",
  template: "templateLibraryBtn",
  compare: "compareBtn"
};
const layouts = ["auto", "1", "2", "3"] as const;
type WorkspaceLayout = (typeof layouts)[number];

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && providers.some((provider) => provider.id === value);
}

function readProviderSelection(value: unknown, fallback: readonly ProviderDescriptor[]) {
  if (!Array.isArray(value)) return fallback.filter((provider) => provider.default).map((provider) => provider.id);
  return value.filter(isProviderId);
}

function emitSelection(providerIds: readonly ProviderId[]) {
  window.dispatchEvent(new CustomEvent("ai-parallel:workspace-set-selection", {
    detail: { providerIds: [...providerIds] }
  }));
}

function triggerLegacyAction(action: WorkspaceAction) {
  document.getElementById(legacyActionIds[action])?.click();
}

export function WorkspaceShell() {
  const [selected, setSelected] = useState<ProviderId[]>([]);
  const [layout, setLayout] = useState<WorkspaceLayout>("auto");

  useEffect(() => {
    let active = true;
    storage.get(["selectedProviders", "workspaceLayout"]).then((data) => {
      if (!active) return;
      setSelected(readProviderSelection(data.selectedProviders, providers));
      setLayout(layouts.includes(data.workspaceLayout as WorkspaceLayout) ? data.workspaceLayout as WorkspaceLayout : "auto");
    }).catch(() => {});

    const handleWorkspaceState = (event: Event) => {
      const detail = (event as CustomEvent<{ selectedProviders?: unknown; workspaceLayout?: unknown }>).detail;
      if (detail?.selectedProviders) setSelected(readProviderSelection(detail.selectedProviders, providers));
      if (layouts.includes(detail?.workspaceLayout as WorkspaceLayout)) setLayout(detail.workspaceLayout as WorkspaceLayout);
    };
    window.addEventListener("ai-parallel:workspace-state", handleWorkspaceState);
    return () => {
      active = false;
      window.removeEventListener("ai-parallel:workspace-state", handleWorkspaceState);
    };
  }, []);

  function toggleProvider(providerId: ProviderId) {
    const next = selected.includes(providerId)
      ? selected.filter((id) => id !== providerId)
      : [...selected, providerId];
    setSelected(next);
    emitSelection(next);
  }

  function changeLayout(next: WorkspaceLayout) {
    setLayout(next);
    document.querySelector<HTMLButtonElement>(`.layout-switch button[data-layout="${next}"]`)?.click();
  }

  return (
    <div className="workspace-react-toolbar">
      <div className="workspace-react-brand">
        <span className="workspace-react-mark">AP</span>
        <span>AI Parallel</span>
        <span className="workspace-react-version">React Shell</span>
      </div>
      <ProviderStrip providers={providers} selected={selected} onToggle={toggleProvider} />
      <WorkspaceActions onAction={triggerLegacyAction} />
      <div className="workspace-layout-switch" aria-label="布局">
        {layouts.map((value) => (
          <Button key={value} size="sm" variant={layout === value ? "secondary" : "ghost"} aria-pressed={layout === value} onClick={() => changeLayout(value)}>
            {value === "auto" ? "Auto" : value}
          </Button>
        ))}
      </div>
    </div>
  );
}
