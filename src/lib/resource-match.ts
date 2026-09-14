import type { Workflow, WorkflowData, Resource, EventsData } from "@/types/server"
import { dayKey } from "@/lib/resourceDate"

// Whether a workflow panel entry is already represented by a resource displayed
// on the same thread. The frontend treats a Resource as an opaque display record
// (title + date) and matches on the only identity the two surfaces share: the
// human-facing name, narrowed by date when both carry one.
//
// Match rule (events):
//   - same workflow, and
//   - the resource title case-invariantly contains (or is contained by) the
//     entry's event name, and
//   - if BOTH the resource and the entry carry a date, they must fall on the same
//     day; if either lacks a date, the name match alone decides.

function isSubstringMatch(a: string, b: string): boolean {
  const la = a.toLowerCase()
  const lb = b.toLowerCase()
  return la.includes(lb) || lb.includes(la)
}

// Returns the [name, date?] a resource-backed entry presents for matching, or null
// when this workflow type has no resource-suppression identity on the frontend.
function entryIdentity(workflow: Workflow, data: WorkflowData): { name: string; date?: string } | null {
  if (workflow !== "events") return null
  const d = data as EventsData
  if (!d.eventName) return null
  return d.eventStartDatetime ? { name: d.eventName, date: d.eventStartDatetime } : { name: d.eventName }
}

export function workflowMatchesResource(
  workflow: Workflow,
  data: WorkflowData,
  resources: readonly Resource[],
): boolean {
  const identity = entryIdentity(workflow, data)
  if (!identity) return false

  return resources.some((resource) => {
    if (resource.workflow !== workflow) return false
    if (!resource.title || !isSubstringMatch(resource.title, identity.name)) return false
    // Date narrows the match only when both sides have one; otherwise name decides.
    if (identity.date && resource.displayDate) {
      return dayKey(identity.date) === dayKey(resource.displayDate)
    }
    return true
  })
}
