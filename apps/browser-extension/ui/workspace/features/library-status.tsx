import { Badge } from "../../components/badge";
import { Button } from "../../components/button";
import type { WorkspaceAction } from "./workspace-actions";

export type WorkspaceLibraryAction = Exclude<WorkspaceAction, "compare">;

export interface WorkspaceLibrarySummary {
  sessions: number;
  prompts: number;
  templates: number;
}

const libraries: Array<{
  action: WorkspaceLibraryAction;
  countKey: keyof WorkspaceLibrarySummary;
  label: string;
}> = [
  { action: "session", countKey: "sessions", label: "Sessions" },
  { action: "prompt", countKey: "prompts", label: "Prompts" },
  { action: "template", countKey: "templates", label: "Templates" }
];

export function LibraryStatus({
  summary,
  onOpen
}: {
  summary: WorkspaceLibrarySummary;
  onOpen: (action: WorkspaceLibraryAction) => void;
}) {
  return (
    <section className="workspace-library-status" aria-label="Workspace 内容库">
      {libraries.map((library) => {
        const count = summary[library.countKey];
        return (
          <article className="workspace-library-card" key={library.action}>
            <div className="workspace-library-card-heading">
              <strong>{library.label}</strong>
              <Badge>{count}</Badge>
            </div>
            <span className="workspace-library-card-state">{count ? "已有内容" : "暂为空"}</span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`打开 ${library.label}`}
              onClick={() => onOpen(library.action)}
            >
              打开
            </Button>
          </article>
        );
      })}
    </section>
  );
}
