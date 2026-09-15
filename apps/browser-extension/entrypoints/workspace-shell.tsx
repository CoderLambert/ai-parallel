import { createRoot } from "react-dom/client";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import "../shared/provider-catalog.js";
import "../shared/storage-contract.js";
import { WorkspaceShell } from "../ui/workspace/workspace-shell";

export default defineUnlistedScript(() => {
  const root = document.getElementById("workspaceReactRoot");
  if (root) createRoot(root).render(<WorkspaceShell />);
});
