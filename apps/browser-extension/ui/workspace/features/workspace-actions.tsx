import { Button } from "../../components/button";

export type WorkspaceAction = "session" | "prompt" | "template" | "compare";

const actions: Array<{ id: WorkspaceAction; label: string }> = [
  { id: "session", label: "Sessions" },
  { id: "prompt", label: "Prompts" },
  { id: "template", label: "Templates" },
  { id: "compare", label: "Compare" }
];

export function WorkspaceActions({ onAction }: { onAction: (action: WorkspaceAction) => void }) {
  return (
    <div className="workspace-actions" aria-label="Workspace 功能">
      {actions.map((action) => (
        <Button key={action.id} size="sm" variant="outline" onClick={() => onAction(action.id)}>
          {action.label}
        </Button>
      ))}
    </div>
  );
}
