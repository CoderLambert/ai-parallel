import { useState } from "react";
import { Badge } from "../../components/badge";
import { Button } from "../../components/button";
import type { WorkspacePromptSummary } from "./prompt-status";

export type WorkspacePromptAction =
  | { type: "save"; title: string }
  | { type: "use"; id: string }
  | { type: "delete"; id: string };

export function PromptLibraryDrawer({
  open,
  prompts,
  status,
  onClose,
  onAction
}: {
  open: boolean;
  prompts: readonly WorkspacePromptSummary[];
  status: string;
  onClose: () => void;
  onAction: (action: WorkspacePromptAction) => void;
}) {
  const [title, setTitle] = useState("");
  if (!open) return null;

  function savePrompt() {
    onAction({ type: "save", title: title.trim() });
    setTitle("");
  }

  return (
    <div className="workspace-react-drawer-layer" role="presentation">
      <button className="workspace-react-drawer-backdrop" type="button" aria-label="关闭 Prompt Library" onClick={onClose} />
      <aside className="workspace-react-drawer" role="dialog" aria-modal="true" aria-labelledby="workspacePromptDrawerTitle">
        <header className="workspace-react-drawer-header">
          <div>
            <div id="workspacePromptDrawerTitle" className="workspace-react-drawer-title">Prompt Library</div>
            <div className="workspace-react-drawer-status">{status || "保存在当前浏览器扩展存储中"}</div>
          </div>
          <Button size="sm" variant="ghost" aria-label="关闭 Prompt Library" onClick={onClose}>×</Button>
        </header>

        <div className="workspace-react-drawer-create">
          <input
            type="text"
            maxLength={80}
            placeholder="Prompt 名称（可选）"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") savePrompt();
            }}
          />
          <Button size="sm" onClick={savePrompt}>保存当前 Prompt</Button>
        </div>

        <div className="workspace-react-prompt-list">
          {!prompts.length && <div className="workspace-react-drawer-empty">还没有保存的 Prompt</div>}
          {prompts.map((prompt) => (
            <article className="workspace-react-prompt-card" key={prompt.id}>
              <header className="workspace-react-prompt-card-header">
                <strong title={prompt.title}>{prompt.title}</strong>
                <Badge>{prompt.contentLength} 字符</Badge>
              </header>
              <time dateTime={prompt.updatedAt}>{formatPromptDate(prompt.updatedAt)}</time>
              <p>{prompt.content}</p>
              <div className="workspace-react-prompt-actions">
                <Button size="sm" variant="secondary" onClick={() => onAction({ type: "use", id: prompt.id })}>使用</Button>
                <Button size="sm" variant="danger" onClick={() => onAction({ type: "delete", id: prompt.id })}>删除</Button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

function formatPromptDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
