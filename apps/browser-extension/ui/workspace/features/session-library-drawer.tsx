import { useState } from "react";
import { Badge } from "../../components/badge";
import { Button } from "../../components/button";
import type { WorkspaceSessionSummary } from "./session-status";

export type WorkspaceSessionAction =
  | { type: "save"; title: string }
  | { type: "load"; id: string }
  | { type: "delete"; id: string };

function formatSessionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SessionLibraryDrawer({
  open,
  sessions,
  status,
  onClose,
  onAction
}: {
  open: boolean;
  sessions: readonly WorkspaceSessionSummary[];
  status: string;
  onClose: () => void;
  onAction: (action: WorkspaceSessionAction) => void;
}) {
  const [title, setTitle] = useState("");
  if (!open) return null;

  function saveSession() {
    onAction({ type: "save", title: title.trim() });
    setTitle("");
  }

  return (
    <div className="workspace-react-drawer-layer" role="presentation">
      <button className="workspace-react-drawer-backdrop" type="button" aria-label="关闭 Sessions" onClick={onClose} />
      <aside className="workspace-react-drawer" role="dialog" aria-modal="true" aria-labelledby="workspaceSessionDrawerTitle">
        <header className="workspace-react-drawer-header">
          <div>
            <div id="workspaceSessionDrawerTitle" className="workspace-react-drawer-title">Sessions</div>
            <div className="workspace-react-drawer-status">{status || "只保存问题、模型选择和布局；回答需要重新收集"}</div>
          </div>
          <Button size="sm" variant="ghost" aria-label="关闭 Sessions" onClick={onClose}>×</Button>
        </header>

        <div className="workspace-react-drawer-create">
          <input
            type="text"
            maxLength={80}
            placeholder="Session 名称（可选）"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveSession();
            }}
          />
          <Button size="sm" onClick={saveSession}>保存当前 Session</Button>
        </div>

        <div className="workspace-react-session-list">
          {!sessions.length && <div className="workspace-react-drawer-empty">还没有保存的 Session</div>}
          {sessions.map((session) => (
            <article className="workspace-react-session-card" key={session.id}>
              <header className="workspace-react-session-card-header">
                <strong title={session.title}>{session.title}</strong>
                <Badge>{session.providerCount} 个模型</Badge>
              </header>
              <time dateTime={session.updatedAt}>{formatSessionDate(session.updatedAt)}</time>
              <span>{session.promptLength} 字符 · 回答不会随 Session 保存</span>
              <div className="workspace-react-session-actions">
                <Button size="sm" variant="secondary" onClick={() => onAction({ type: "load", id: session.id })}>加载</Button>
                <Button size="sm" variant="danger" onClick={() => onAction({ type: "delete", id: session.id })}>删除</Button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
