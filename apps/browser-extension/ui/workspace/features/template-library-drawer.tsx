import { useRef, useState } from "react";
import { Badge } from "../../components/badge";
import { Button } from "../../components/button";
import type { WorkspaceTemplateSummary } from "./template-status";

export type WorkspaceTemplateAction =
  | { type: "import"; text: string }
  | { type: "copySchema" }
  | { type: "exportAll" }
  | { type: "use"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "export"; id: string }
  | { type: "delete"; id: string };

export function TemplateLibraryDrawer({
  open,
  templates,
  status,
  onClose,
  onAction
}: {
  open: boolean;
  templates: readonly WorkspaceTemplateSummary[];
  status: string;
  onClose: () => void;
  onAction: (action: WorkspaceTemplateAction) => void;
}) {
  const [category, setCategory] = useState("全部分类");
  const [query, setQuery] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  if (!open) return null;

  const categories = ["全部分类", ...Array.from(new Set(templates.map((template) => template.category))).sort()];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleTemplates = templates.filter((template) => {
    if (category !== "全部分类" && template.category !== category) return false;
    if (!normalizedQuery) return true;
    return [template.name, template.category, template.description]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });

  async function importTemplate(file: File | undefined) {
    if (!file) return;
    try {
      onAction({ type: "import", text: await file.text() });
    } catch {
      onAction({ type: "import", text: "" });
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  return (
    <div className="workspace-react-drawer-layer" role="presentation">
      <button className="workspace-react-drawer-backdrop" type="button" aria-label="关闭 Prompt Templates" onClick={onClose} />
      <aside className="workspace-react-drawer workspace-react-template-drawer" role="dialog" aria-modal="true" aria-labelledby="workspaceTemplateDrawerTitle">
        <header className="workspace-react-drawer-header">
          <div>
            <div id="workspaceTemplateDrawerTitle" className="workspace-react-drawer-title">Prompt Templates</div>
            <div className="workspace-react-drawer-status">{status || "模板、输入 Schema 和输出 Schema 均保存在当前浏览器"}</div>
          </div>
          <Button size="sm" variant="ghost" aria-label="关闭 Prompt Templates" onClick={onClose}>×</Button>
        </header>

        <div className="workspace-react-template-toolbar">
          <select aria-label="模板分类" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <input type="search" maxLength={80} placeholder="搜索模板、描述或标签" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="workspace-react-template-actions">
            <Button size="sm" variant="outline" onClick={() => importInput.current?.click()}>导入 JSON</Button>
            <Button size="sm" variant="outline" onClick={() => onAction({ type: "copySchema" })}>复制生成规范</Button>
            <Button size="sm" variant="outline" onClick={() => onAction({ type: "exportAll" })}>导出全部</Button>
            <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={(event) => importTemplate(event.target.files?.[0])} />
          </div>
        </div>

        <div className="workspace-react-template-list">
          {!visibleTemplates.length && <div className="workspace-react-drawer-empty">没有匹配的模板；可以导入其他模型生成的 JSON。</div>}
          {visibleTemplates.map((template) => (
            <article className="workspace-react-template-card" key={template.id}>
              <header className="workspace-react-template-card-header">
                <strong title={template.name}>{template.name}</strong>
                <Badge>{template.source === "builtin" ? "内置" : "自定义"}</Badge>
              </header>
              <div className="workspace-react-template-meta">
                <span>{template.category}</span>
                <span>{template.outputMode === "json" ? "JSON 输出" : "文本输出"} · v{template.version}</span>
              </div>
              <p>{template.description}</p>
              <div className="workspace-react-template-card-actions">
                <Button size="sm" variant="secondary" onClick={() => onAction({ type: "use", id: template.id })}>使用</Button>
                <Button size="sm" variant="outline" onClick={() => onAction({ type: "duplicate", id: template.id })}>复制</Button>
                <Button size="sm" variant="outline" onClick={() => onAction({ type: "export", id: template.id })}>导出</Button>
                {template.source === "user" && <Button size="sm" variant="danger" onClick={() => onAction({ type: "delete", id: template.id })}>删除</Button>}
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
