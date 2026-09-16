import { Badge } from "../../components/badge";
import { Button } from "../../components/button";

export interface CompareSummary {
  open: boolean;
  responseCount: number;
  pendingCount: number;
  status: string;
  responses?: readonly WorkspaceCompareResponse[];
}

export interface WorkspaceCompareResponse {
  providerId: string;
  providerName: string;
  ok: boolean;
  pending: boolean;
  content: string;
  error: string;
  timestamp: string;
  schemaStatus: "" | "valid" | "invalid";
  canImportTemplate: boolean;
}

export function CompareStatus({
  selectedCount,
  summary,
  onOpen
}: {
  selectedCount: number;
  summary: CompareSummary;
  onOpen: () => void;
}) {
  const status = summary.status || (selectedCount ? "点击 Compare 收集当前回答" : "请先选择模型");
  return (
    <section className="workspace-compare-status" aria-label="Compare 摘要">
      <div className="workspace-compare-status-heading">
        <strong>Compare</strong>
        <Badge>{summary.responseCount}/{selectedCount}</Badge>
        {summary.pendingCount > 0 && <span className="workspace-compare-pending">收集中 {summary.pendingCount}</span>}
      </div>
      <span className="workspace-compare-status-message" title={status} aria-live="polite">{status}</span>
      <Button size="sm" variant={summary.open ? "secondary" : "outline"} onClick={onOpen}>
        {summary.open ? "Compare 已打开" : "打开 Compare"}
      </Button>
    </section>
  );
}
