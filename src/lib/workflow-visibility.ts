import type { Workflow, WorkflowData, WorkflowDataMap } from "@/types/server"
import type { WorkflowGroup } from "@/lib/workflow-aggregator"

// The `_workflow` value never appears in `data` itself (workflowData carries no
// discriminant of its own) — it only pins the generic so the return type narrows.
function narrowWorkflowData<W extends keyof WorkflowDataMap>(_workflow: W, data: WorkflowData): WorkflowDataMap[W] {
  return data as WorkflowDataMap[W]
}

// Mirrors the per-entry visibility rules used when rendering a WorkflowPanel:
// auth entries need a code/link/action, conversation entries need a reply pending.
export function isWorkflowEntryVisible(workflow: Workflow, entry: WorkflowData, hasActions = false): boolean {
  if (workflow === "auth") {
    const auth = narrowWorkflowData("auth", entry)
    return !!(auth.code || auth.actionUrl || hasActions)
  }
  if (workflow === "conversation") {
    return !!narrowWorkflowData("conversation", entry).requiresReply
  }
  return true
}

// True when a WorkflowPanel rendering this group would actually display something.
export function groupHasVisibleEntries(group: Pick<WorkflowGroup, "workflow" | "entries">): boolean {
  return group.entries.some((entry) => isWorkflowEntryVisible(group.workflow, entry))
}
