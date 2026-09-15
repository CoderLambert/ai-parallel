import { Badge } from "../../components/badge";
import { Button } from "../../components/button";

export function HandoffStatus({
  responseCount,
  onOpen
}: {
  responseCount: number;
  onOpen: () => void;
}) {
  const ready = responseCount > 0;
  return (
    <section className="workspace-handoff-status" aria-label="Agent Handoff">
      <div className="workspace-handoff-status-heading">
        <div className="workspace-handoff-status-title">
          <strong>Agent Handoff</strong>
          <Badge>{ready ? "Ready" : "待准备"}</Badge>
        </div>
        <Button size="sm" variant={ready ? "secondary" : "outline"} onClick={onOpen}>打开 Handoff</Button>
      </div>
      <span className="workspace-handoff-status-message">
        {ready ? `已收集 ${responseCount} 个回答，可打开 Compare 发送到 Agent` : "先通过 Compare 收集当前回答，再进行 Agent handoff"}
      </span>
    </section>
  );
}
