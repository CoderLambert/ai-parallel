import { Badge } from "../../components/badge";
import { Button } from "../../components/button";

export interface WorkspaceSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  providerCount: number;
  promptLength: number;
}

function formatSessionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SessionStatus({
  sessions,
  onOpen
}: {
  sessions: readonly WorkspaceSessionSummary[];
  onOpen: () => void;
}) {
  const visibleSessions = sessions.slice(0, 3);
  const remainingCount = Math.max(0, sessions.length - visibleSessions.length);

  return (
    <section className="workspace-session-status" aria-label="最近 Session">
      <div className="workspace-session-status-heading">
        <div className="workspace-session-status-title">
          <strong>Recent Sessions</strong>
          <Badge>{sessions.length}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={onOpen}>打开 Sessions</Button>
      </div>
      <div className="workspace-session-preview">
        {!visibleSessions.length && <div className="workspace-session-empty">还没有保存的 Session</div>}
        {visibleSessions.map((session) => (
          <article className="workspace-session-card" key={session.id}>
            <strong title={session.title}>{session.title}</strong>
            <span>{formatSessionDate(session.updatedAt)}</span>
            <small>{session.providerCount} 个模型 · {session.promptLength} 字符</small>
          </article>
        ))}
        {remainingCount > 0 && <span className="workspace-session-more">还有 {remainingCount} 个，请打开 Sessions 查看</span>}
      </div>
    </section>
  );
}
