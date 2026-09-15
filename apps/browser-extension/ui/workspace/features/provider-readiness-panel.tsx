import type { ProviderDescriptor, ProviderId } from "../../../contracts/provider";
import { Button } from "../../components/button";
import type { ProviderReadiness } from "./provider-strip";

export type ProviderPanelAction = "reload" | "open";

function readinessClass(readiness: ProviderReadiness | undefined) {
  if (readiness?.ready) return "is-ready";
  if (readiness?.loaded) return "is-loading";
  return "is-pending";
}

export function ProviderReadinessPanel({
  providers,
  selected,
  readiness,
  onAction
}: {
  providers: readonly ProviderDescriptor[];
  selected: readonly ProviderId[];
  readiness: Partial<Record<ProviderId, ProviderReadiness>>;
  onAction: (providerId: ProviderId, action: ProviderPanelAction) => void;
}) {
  const selectedSet = new Set(selected);
  const selectedProviders = providers.filter((provider) => selectedSet.has(provider.id));

  return (
    <div className="workspace-provider-readiness-panel" aria-label="模型面板状态">
      {!selectedProviders.length && <div className="workspace-provider-readiness-empty">请选择模型以显示面板状态</div>}
      {selectedProviders.map((provider) => {
        const providerReadiness = readiness[provider.id];
        const status = providerReadiness?.status || "未加载";
        return (
          <article className="workspace-provider-readiness-card" key={provider.id} data-provider-id={provider.id}>
            <span className={`workspace-provider-readiness ${readinessClass(providerReadiness)}`} aria-hidden="true" />
            <div className="workspace-provider-readiness-copy">
              <strong>{provider.name}</strong>
              <span>{status}</span>
            </div>
            <div className="workspace-provider-readiness-actions">
              <Button
                size="sm"
                variant="ghost"
                aria-label={`重新加载 ${provider.name}`}
                title={`重新加载 ${provider.name}`}
                onClick={() => onAction(provider.id, "reload")}
              >
                ↻
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`在新标签页打开 ${provider.name}`}
                title={`在新标签页打开 ${provider.name}`}
                onClick={() => onAction(provider.id, "open")}
              >
                ↗
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
