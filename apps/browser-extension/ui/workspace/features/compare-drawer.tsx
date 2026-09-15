import { Badge } from "../../components/badge";
import { Button } from "../../components/button";
import type { CompareSummary, WorkspaceCompareResponse } from "./compare-status";

export type WorkspaceCompareAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "retry"; providerId: string }
  | { type: "importTemplate"; providerId: string }
  | { type: "copyMarkdown" }
  | { type: "copyJson" }
  | { type: "downloadMarkdown" }
  | { type: "sendAgent"; target: string };

const agentTargets = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "grok", label: "Grok" }
];

function formatResponseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CompareDrawer({
  open,
  summary,
  onAction
}: {
  open: boolean;
  summary: CompareSummary;
  onAction: (action: WorkspaceCompareAction) => void;
}) {
  if (!open) return null;
  const responses = summary.responses || [];
  const ready = responses.some((response) => response.ok && response.content.trim());

  return (
    <div className="workspace-react-drawer-layer" role="presentation">
      <button className="workspace-react-drawer-backdrop" type="button" aria-label="关闭 Compare" onClick={() => onAction({ type: "close" })} />
      <aside className="workspace-react-drawer workspace-react-compare-drawer" role="dialog" aria-modal="true" aria-labelledby="workspaceCompareDrawerTitle">
        <header className="workspace-react-drawer-header">
          <div>
            <div id="workspaceCompareDrawerTitle" className="workspace-react-drawer-title">Comparison</div>
            <div className="workspace-react-drawer-status">{summary.status || "按需收集已选模型的当前回答"}</div>
          </div>
          <Button size="sm" variant="ghost" aria-label="关闭 Compare" onClick={() => onAction({ type: "close" })}>×</Button>
        </header>

        <div className="workspace-react-response-list">
          {!responses.length && <div className="workspace-react-drawer-empty">请先选择模型</div>}
          {responses.length > 0 && !summary.responseCount && !summary.pendingCount && (
            <div className="workspace-react-drawer-empty">点击下方按钮收集当前可见回答</div>
          )}
          {responses.map((response) => (
            <article className="workspace-react-response-card" key={response.providerId}>
              <header className="workspace-react-response-header">
                <strong>{response.providerName}</strong>
                {response.schemaStatus && <Badge>{response.schemaStatus === "valid" ? "Schema 通过" : "Schema 未通过"}</Badge>}
                {response.timestamp && <time dateTime={response.timestamp}>{formatResponseDate(response.timestamp)}</time>}
              </header>
              {response.pending && <div className="workspace-react-response-pending">正在收集当前回答…</div>}
              {response.ok && response.content && <pre>{response.content}</pre>}
              {!response.ok && !response.pending && (
                <div className="workspace-react-response-error">
                  <span>{response.error || "未收集到回答"}</span>
                  <Button size="sm" variant="outline" onClick={() => onAction({ type: "retry", providerId: response.providerId })}>重试</Button>
                </div>
              )}
              {response.canImportTemplate && (
                <div className="workspace-react-response-actions">
                  <Button size="sm" variant="outline" onClick={() => onAction({ type: "importTemplate", providerId: response.providerId })}>尝试导入模板</Button>
                </div>
              )}
            </article>
          ))}
        </div>

        <footer className="workspace-react-compare-footer">
          <div className="workspace-react-compare-export-actions">
            <Button size="sm" variant="outline" onClick={() => onAction({ type: "copyMarkdown" })}>Copy Markdown</Button>
            <Button size="sm" variant="outline" onClick={() => onAction({ type: "copyJson" })}>Copy JSON</Button>
            <Button size="sm" variant="outline" onClick={() => onAction({ type: "downloadMarkdown" })}>Download md</Button>
          </div>
          <div className="workspace-react-handoff-row">
            <select aria-label="目标 Agent" defaultValue="chatgpt">
              {agentTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
            </select>
            <Button
              size="sm"
              variant={ready ? "secondary" : "outline"}
              disabled={!ready}
              onClick={(event) => {
                const target = event.currentTarget.parentElement?.querySelector<HTMLSelectElement>("select")?.value || "chatgpt";
                onAction({ type: "sendAgent", target });
              }}
            >
              Send Agent
            </Button>
          </div>
          <Button size="sm" variant="primary" onClick={() => onAction({ type: "open" })}>
            {summary.pendingCount ? "收集中 " + summary.pendingCount : "重新收集"}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
