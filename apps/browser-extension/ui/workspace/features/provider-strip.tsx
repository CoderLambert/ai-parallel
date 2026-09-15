import type { ProviderDescriptor, ProviderId } from "../../../contracts/provider";
import { Badge } from "../../components/badge";
import { Button } from "../../components/button";

export interface ProviderReadiness {
  loaded: boolean;
  ready: boolean;
  status: string;
}

function readinessClass(readiness: ProviderReadiness | undefined, selected: boolean) {
  if (!selected) return "is-idle";
  if (readiness?.ready) return "is-ready";
  if (readiness?.loaded) return "is-loading";
  return "is-pending";
}

export function ProviderStrip({
  providers,
  selected,
  onToggle,
  readiness = {}
}: {
  providers: readonly ProviderDescriptor[];
  selected: readonly ProviderId[];
  onToggle: (providerId: ProviderId) => void;
  readiness?: Partial<Record<ProviderId, ProviderReadiness>>;
}) {
  const selectedSet = new Set(selected);
  return (
    <div className="workspace-provider-strip" aria-label="Workspace 模型选择">
      {providers.map((provider) => {
        const active = selectedSet.has(provider.id);
        const providerReadiness = readiness[provider.id];
        const status = active ? providerReadiness?.status || "未加载" : "未选择";
        return (
          <Button
            key={provider.id}
            size="sm"
            variant={active ? "secondary" : "ghost"}
            className="workspace-provider-button"
            aria-pressed={active}
            title={`${provider.name}: ${status}`}
            onClick={() => onToggle(provider.id)}
          >
            {provider.name}
            <span
              className={`workspace-provider-readiness ${readinessClass(providerReadiness, active)}`}
              aria-label={status}
              title={status}
            />
          </Button>
        );
      })}
      <Badge>{selected.length} 个模型</Badge>
    </div>
  );
}
