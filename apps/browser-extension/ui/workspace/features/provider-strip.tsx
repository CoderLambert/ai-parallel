import type { ProviderDescriptor, ProviderId } from "../../../contracts/provider";
import { Badge } from "../../components/badge";
import { Button } from "../../components/button";

export function ProviderStrip({
  providers,
  selected,
  onToggle
}: {
  providers: readonly ProviderDescriptor[];
  selected: readonly ProviderId[];
  onToggle: (providerId: ProviderId) => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <div className="workspace-provider-strip" aria-label="Workspace 模型选择">
      {providers.map((provider) => {
        const active = selectedSet.has(provider.id);
        return (
          <Button
            key={provider.id}
            size="sm"
            variant={active ? "secondary" : "ghost"}
            className="workspace-provider-button"
            aria-pressed={active}
            onClick={() => onToggle(provider.id)}
          >
            {provider.name}
          </Button>
        );
      })}
      <Badge>{selected.length} 个模型</Badge>
    </div>
  );
}
