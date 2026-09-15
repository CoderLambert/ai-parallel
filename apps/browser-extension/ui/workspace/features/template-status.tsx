import { Badge } from "../../components/badge";
import { Button } from "../../components/button";

export interface WorkspaceTemplateSummary {
  id: string;
  name: string;
  category: string;
  outputMode: "json" | "text";
  version: number;
  source: "builtin" | "user";
}

export function TemplateStatus({
  templates,
  onOpen
}: {
  templates: readonly WorkspaceTemplateSummary[];
  onOpen: () => void;
}) {
  const visibleTemplates = templates.slice(0, 4);
  const remainingCount = Math.max(0, templates.length - visibleTemplates.length);

  return (
    <section className="workspace-template-status" aria-label="最近模板">
      <div className="workspace-template-status-heading">
        <div className="workspace-template-status-title">
          <strong>Recent Templates</strong>
          <Badge>{templates.length}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={onOpen}>打开 Templates</Button>
      </div>
      <div className="workspace-template-preview">
        {!visibleTemplates.length && <div className="workspace-template-empty">还没有可用的模板</div>}
        {visibleTemplates.map((template) => (
          <article className="workspace-template-card" key={template.id}>
            <div className="workspace-template-card-title">
              <strong title={template.name}>{template.name}</strong>
              <Badge>{template.source === "builtin" ? "内置" : "自定义"}</Badge>
            </div>
            <span>{template.category}</span>
            <small>{template.outputMode === "json" ? "JSON 输出" : "文本输出"} · v{template.version}</small>
          </article>
        ))}
        {remainingCount > 0 && <span className="workspace-template-more">还有 {remainingCount} 个，请打开 Templates 查看</span>}
      </div>
    </section>
  );
}
