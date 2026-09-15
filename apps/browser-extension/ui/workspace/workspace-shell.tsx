import { useEffect, useState } from "react";
import type { ProviderDescriptor, ProviderId } from "../../contracts/provider";
import { Button } from "../components/button";
import { ProviderStrip, type ProviderReadiness } from "./features/provider-strip";
import { ProviderReadinessPanel, type ProviderPanelAction } from "./features/provider-readiness-panel";
import { CompareStatus, type CompareSummary } from "./features/compare-status";
import { LibraryStatus, type WorkspaceLibrarySummary } from "./features/library-status";
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
type ProviderReadinessMap = Partial<Record<ProviderId, ProviderReadiness>>;
const emptyCompareSummary: CompareSummary = { open: false, responseCount: 0, pendingCount: 0, status: "" };
const emptyLibrarySummary: WorkspaceLibrarySummary = { sessions: 0, prompts: 0, templates: 0 };

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && providers.some((provider) => provider.id === value);
}

function readProviderSelection(value: unknown, fallback: readonly ProviderDescriptor[]) {
  if (!Array.isArray(value)) return fallback.filter((provider) => provider.default).map((provider) => provider.id);
  return value.filter(isProviderId);
}

function readProviderReadiness(value: unknown): ProviderReadinessMap {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (!isProviderId(record.providerId)) return [];
    return [[record.providerId, {
      loaded: record.loaded === true,
      ready: record.ready === true,
      status: typeof record.status === "string" ? record.status : "未加载"
    }]];
  })) as ProviderReadinessMap;
}

function readCompareSummary(value: unknown): CompareSummary {
  if (!value || typeof value !== "object") return emptyCompareSummary;
  const record = value as Record<string, unknown>;
  return {
    open: record.open === true,
    responseCount: typeof record.responseCount === "number" && Number.isFinite(record.responseCount)
      ? Math.max(0, Math.floor(record.responseCount))
      : 0,
    pendingCount: typeof record.pendingCount === "number" && Number.isFinite(record.pendingCount)
      ? Math.max(0, Math.floor(record.pendingCount))
      : 0,
    status: typeof record.status === "string" ? record.status : ""
  };
}

function readLibrarySummary(value: unknown): WorkspaceLibrarySummary {
  if (!value || typeof value !== "object") return emptyLibrarySummary;
  const record = value as Record<string, unknown>;
  return {
    sessions: typeof record.sessions === "number" && Number.isFinite(record.sessions)
      ? Math.max(0, Math.floor(record.sessions))
      : 0,
    prompts: typeof record.prompts === "number" && Number.isFinite(record.prompts)
      ? Math.max(0, Math.floor(record.prompts))
      : 0,
    templates: typeof record.templates === "number" && Number.isFinite(record.templates)
      ? Math.max(0, Math.floor(record.templates))
      : 0
  };
}

function emitSelection(providerIds: readonly ProviderId[]) {
  window.dispatchEvent(new CustomEvent("ai-parallel:workspace-set-selection", {
    detail: { providerIds: [...providerIds] }
  }));
}

function triggerLegacyAction(action: WorkspaceAction) {
  document.getElementById(legacyActionIds[action])?.click();
}

function triggerProviderPanelAction(providerId: ProviderId, action: ProviderPanelAction) {
  const panel = [...document.querySelectorAll<HTMLElement>(".provider-panel")]
    .find((candidate) => candidate.dataset.providerId === providerId);
  const buttonClass = action === "reload" ? ".reload-btn" : ".open-btn";
  panel?.querySelector<HTMLButtonElement>(buttonClass)?.click();
}

export function WorkspaceShell() {
  const [selected, setSelected] = useState<ProviderId[]>([]);
  const [layout, setLayout] = useState<WorkspaceLayout>("auto");
  const [readiness, setReadiness] = useState<ProviderReadinessMap>({});
  const [compare, setCompare] = useState<CompareSummary>(emptyCompareSummary);
  const [libraries, setLibraries] = useState<WorkspaceLibrarySummary>(emptyLibrarySummary);

  useEffect(() => {
    let active = true;
    storage.get(["selectedProviders", "workspaceLayout"]).then((data) => {
      if (!active) return;
      setSelected(readProviderSelection(data.selectedProviders, providers));
      setLayout(layouts.includes(data.workspaceLayout as WorkspaceLayout) ? data.workspaceLayout as WorkspaceLayout : "auto");
    }).catch(() => {});

    const handleWorkspaceState = (event: Event) => {
      const detail = (event as CustomEvent<{
        selectedProviders?: unknown;
        workspaceLayout?: unknown;
        providerStates?: unknown;
        compare?: unknown;
        libraries?: unknown;
      }>).detail;
      if (detail?.selectedProviders) setSelected(readProviderSelection(detail.selectedProviders, providers));
      if (layouts.includes(detail?.workspaceLayout as WorkspaceLayout)) setLayout(detail.workspaceLayout as WorkspaceLayout);
      if (detail?.providerStates) setReadiness(readProviderReadiness(detail.providerStates));
      if (detail?.compare) setCompare(readCompareSummary(detail.compare));
      if (detail?.libraries) setLibraries(readLibrarySummary(detail.libraries));
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
      <ProviderStrip providers={providers} selected={selected} readiness={readiness} onToggle={toggleProvider} />
      <WorkspaceActions onAction={triggerLegacyAction} />
      <div className="workspace-layout-switch" aria-label="布局">
        {layouts.map((value) => (
          <Button key={value} size="sm" variant={layout === value ? "secondary" : "ghost"} aria-pressed={layout === value} onClick={() => changeLayout(value)}>
            {value === "auto" ? "Auto" : value}
          </Button>
        ))}
      </div>
      <ProviderReadinessPanel
        providers={providers}
        selected={selected}
        readiness={readiness}
        onAction={triggerProviderPanelAction}
      />
      <CompareStatus selectedCount={selected.length} summary={compare} onOpen={() => triggerLegacyAction("compare")} />
      <LibraryStatus summary={libraries} onOpen={triggerLegacyAction} />
    </div>
  );
}
