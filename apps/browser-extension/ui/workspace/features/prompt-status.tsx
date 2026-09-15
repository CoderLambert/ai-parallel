import { Badge } from "../../components/badge";
import { Button } from "../../components/button";

export interface WorkspacePromptSummary {
  id: string;
  title: string;
  updatedAt: string;
  contentLength: number;
  content: string;
}

function formatPromptDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PromptStatus({
  prompts,
  onOpen
}: {
  prompts: readonly WorkspacePromptSummary[];
  onOpen: () => void;
}) {
  const visiblePrompts = prompts.slice(0, 3);
  const remainingCount = Math.max(0, prompts.length - visiblePrompts.length);

  return (
    <section className="workspace-prompt-status" aria-label="最近 Prompt">
      <div className="workspace-prompt-status-heading">
        <div className="workspace-prompt-status-title">
          <strong>Recent Prompts</strong>
          <Badge>{prompts.length}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={onOpen}>打开 Prompts</Button>
      </div>
      <div className="workspace-prompt-preview">
        {!visiblePrompts.length && <div className="workspace-prompt-empty">还没有保存的 Prompt</div>}
        {visiblePrompts.map((prompt) => (
          <article className="workspace-prompt-card" key={prompt.id}>
            <strong title={prompt.title}>{prompt.title}</strong>
            <span>{formatPromptDate(prompt.updatedAt)}</span>
            <small>{prompt.contentLength} 字符</small>
          </article>
        ))}
        {remainingCount > 0 && <span className="workspace-prompt-more">还有 {remainingCount} 个，请打开 Prompts 查看</span>}
      </div>
    </section>
  );
}
