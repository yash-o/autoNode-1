# Predictive Risk Analysis System — Implementation Plan

## Overview

Analyze workflow structure and historical execution data to calculate a **failure risk score**
for each workflow. Surface risk badges on workflow cards, risk overlays on individual nodes
inside the editor, and a dedicated risk panel with actionable recommendations.

All scores are computed from real data using clearly defined formulas — no black-box AI.

---

## How the Risk Score Works (Algorithm)

### Per-Node Risk Score

Tracks how often a specific node type has failed across all executions of a given workflow.

```
nodeFailureRate = failedRuns / totalRuns        (0.0 – 1.0)
nodeRiskScore   = nodeFailureRate × 100         (0 – 100)
```

### Workflow Risk Score

Combines node-level risk with structural penalties derived from the graph shape.

```
baseScore         = average of all nodeRiskScores

chainPenalty      = (longestSequentialChain - 3) × 2    // penalise deep chains
                    capped at 20, 0 if chain ≤ 3

missingHandlerPenalty = (externalNodes with no outgoing fallback) × 5
                        external nodes = HTTP_REQUEST, GMAIL, DISCORD, SLACK,
                                         GOOGLE_SHEETS, OPENAI, GEMINI, ANTHROPIC
                        capped at 20

workflowRiskScore = min(100, baseScore + chainPenalty + missingHandlerPenalty)
```

### Risk Level Labels

| Score    | Label  | Colour  |
|----------|--------|---------|
| 0 – 30   | Low    | green   |
| 31 – 60  | Medium | yellow  |
| 61 – 100 | High   | red     |

---

## Database Changes

### New model: `NodeExecutionRecord`

Add to `prisma/schema.prisma`:

```prisma
model NodeExecutionRecord {
  id          String   @id @default(cuid())
  executionId String
  execution   Execution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  workflowId  String
  nodeId      String       // React Flow node id (string from node.id)
  nodeType    NodeType
  status      NodeExecutionStatus
  error       String?  @db.Text
  startedAt   DateTime @default(now())
  completedAt DateTime?

  @@index([workflowId, nodeType])
  @@index([executionId])
}

enum NodeExecutionStatus {
  SUCCESS
  FAILED
}
```

Also add the reverse relation to the existing `Execution` model:

```prisma
model Execution {
  // ... existing fields ...
  nodeRecords NodeExecutionRecord[]
}
```

Create and run the migration:

```bash
npx prisma migrate dev --name add_node_execution_records
```

---

## Phase 1 — Record Per-Node Outcomes During Execution

**File to modify:** `src/inngest/functions.ts`

The execution engine already has a try/catch pattern inside every executor. After each node
finishes (success or throws), write a `NodeExecutionRecord` row.

Wrap the executor call in `executeNode` and in the linear loop:

```ts
// After executor returns successfully:
await prisma.nodeExecutionRecord.create({
  data: {
    executionId,   // passed down from create-execution step
    workflowId,
    nodeId: node.id,
    nodeType: node.type as NodeType,
    status: "SUCCESS",
    completedAt: new Date(),
  },
});

// In the catch block before re-throwing:
await prisma.nodeExecutionRecord.create({
  data: {
    executionId,
    workflowId,
    nodeId: node.id,
    nodeType: node.type as NodeType,
    status: "FAILED",
    error: (error as Error).message,
    completedAt: new Date(),
  },
});
```

No changes to any executor file. Only `functions.ts` is modified.

---

## Phase 2 — Risk Computation Logic (Pure Function)

**New file:** `src/features/risk/lib/compute-risk.ts`

This file exports one pure function. It takes workflow nodes, connections, and aggregated
node stats and returns the complete risk report. No database calls — receives pre-fetched data.

```ts
export type NodeStats = {
  nodeType: NodeType;
  totalRuns: number;
  failedRuns: number;
};

export type NodeRisk = {
  nodeId: string;
  nodeType: NodeType;
  failureRate: number;   // 0.0 – 1.0
  riskScore: number;     // 0 – 100
};

export type WorkflowRiskReport = {
  workflowRiskScore: number;        // 0 – 100
  riskLevel: "low" | "medium" | "high";
  nodeRisks: NodeRisk[];
  recommendations: string[];
  totalRuns: number;
  successRate: number;
};

export function computeWorkflowRisk(
  nodes: { id: string; type: NodeType }[],
  connections: { fromNodeId: string; toNodeId: string }[],
  nodeStats: NodeStats[],
  executionStats: { total: number; failed: number },
): WorkflowRiskReport { ... }
```

Internal helpers inside this file:
- `computeLongestChain(nodes, connections)` — BFS/DFS to find longest sequential path length
- `countMissingFallbacks(nodes, connections)` — count external-API nodes with no outgoing connection
- `buildRecommendations(nodeRisks, chainLength, missingFallbacks)` — returns string array

---

## Phase 3 — tRPC Router

**New file:** `src/features/risk/server/routers.ts`

Two procedures:

```ts
export const riskRouter = createTRPCRouter({

  // Returns full risk report for one workflow
  getWorkflowRisk: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ ctx, input }) => {
      // 1. Load workflow nodes + connections
      // 2. Query NodeExecutionRecord grouped by nodeType → { totalRuns, failedRuns }
      // 3. Query Execution count → { total, failed }
      // 4. Call computeWorkflowRisk() and return report
    }),

  // Returns lightweight risk summary for many workflows (for dashboard cards)
  getManyRiskSummaries: protectedProcedure
    .input(z.object({ workflowIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      // Returns { workflowId, riskScore, riskLevel }[] for each id
    }),

});
```

**Register in** `src/trpc/routers/_app.ts`:

```ts
import { riskRouter } from '@/features/risk/server/routers';

export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  credentials: credentialsRouter,
  executions: executionsRouter,
  risk: riskRouter,          // add this line
});
```

---

## Phase 4 — React Hooks

**New file:** `src/features/risk/hooks/use-workflow-risk.ts`

```ts
export const useWorkflowRisk = (workflowId: string) => {
  return trpc.risk.getWorkflowRisk.useQuery({ workflowId });
};

export const useManyRiskSummaries = (workflowIds: string[]) => {
  return trpc.risk.getManyRiskSummaries.useQuery({ workflowIds });
};
```

---

## Phase 5 — UI Components

### 5a. Risk Badge Component

**New file:** `src/features/risk/components/risk-badge.tsx`

A small pill badge showing Low / Medium / High with appropriate colour.
Used on workflow cards in the workflows list page.

```tsx
<RiskBadge level="high" score={72} />
// renders: red pill "High Risk · 72"
```

### 5b. Risk Panel (Editor Sidebar)

**New file:** `src/features/risk/components/risk-panel.tsx`

Shown inside the workflow editor alongside the canvas. Displays:
- Overall risk score with a progress bar (green → red gradient)
- Risk level label
- Table of node risks: node type | runs | failures | risk %
- Recommendations list (bullet points from `computeWorkflowRisk`)
- "Not enough data" empty state when < 3 executions exist

### 5c. Node Risk Overlay

**Modify:** `src/features/editor/components/editor.tsx`

After fetching the risk report, pass each node's `riskScore` down into the node's `data`
object (without saving to DB — only in local React state). Node components already read
`data` props, so a coloured ring or dot can be rendered based on `data.__riskScore`.

Alternatively, store risk scores in a Jotai atom alongside `editorAtom` to avoid polluting
node data:

**New file:** `src/features/risk/store/risk-atoms.ts`

```ts
export const nodeRiskAtom = atom<Record<string, number>>({});
// key: nodeId, value: riskScore 0–100
```

Each node component reads from this atom and conditionally renders a coloured dot in the
top-right corner (green / yellow / red).

### 5d. Workflow Card Risk Badge

**Modify:** `src/features/workflows/components/workflow-card.tsx` (or equivalent list item)

Fetch `getManyRiskSummaries` for the visible workflow IDs and render `<RiskBadge>` on each
card. Use a skeleton placeholder while loading.

---

## Phase 6 — New Page: `/workflows/[workflowId]/risk`

**New file:** `src/app/(dashboard)/(editor)/workflows/[workflowId]/risk/page.tsx`

A dedicated full-page risk report for a single workflow. Shows:
- Workflow name + risk score header
- Node risk breakdown table
- Execution history summary (last 20 runs — success/fail)
- Recommendations section

This page reuses the `risk-panel` component in an expanded layout.

---

## File Structure Summary

```
src/
├── features/
│   └── risk/
│       ├── lib/
│       │   └── compute-risk.ts          ← pure algorithm, no DB
│       ├── server/
│       │   └── routers.ts               ← tRPC procedures
│       ├── hooks/
│       │   └── use-workflow-risk.ts     ← tRPC query hooks
│       ├── store/
│       │   └── risk-atoms.ts            ← Jotai atoms for node risk overlay
│       └── components/
│           ├── risk-badge.tsx           ← Low/Medium/High pill
│           ├── risk-panel.tsx           ← full risk report panel
│           └── node-risk-overlay.tsx    ← per-node coloured indicator
├── app/(dashboard)/(editor)/workflows/[workflowId]/
│   └── risk/
│       └── page.tsx                     ← dedicated risk page
prisma/
└── schema.prisma                        ← add NodeExecutionRecord model
```

---

## Existing Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `NodeExecutionRecord` model and enum |
| `src/inngest/functions.ts` | Write `NodeExecutionRecord` after each node execution |
| `src/trpc/routers/_app.ts` | Register `riskRouter` |
| `src/features/editor/components/editor.tsx` | Fetch risk report, populate `nodeRiskAtom` |
| `src/features/workflows/components/workflow-card.tsx` | Add `<RiskBadge>` |

All other changes are additive new files.

---

## Implementation Order

1. Prisma schema + migration
2. `compute-risk.ts` — write and unit-test the algorithm in isolation
3. Modify `functions.ts` — start recording `NodeExecutionRecord` rows
4. tRPC router + hooks
5. `risk-badge.tsx` → add to workflow cards (first visible result)
6. `risk-panel.tsx` → add to editor
7. Node risk overlay via Jotai atom
8. Dedicated `/risk` page

---

## Academic Talking Points

- **Explainability**: every score is a direct function of real execution counts — show the formula in the viva
- **No arbitrary AI**: the algorithm is deterministic and reproducible
- **Graph analysis**: chain length penalty demonstrates understanding of DAG traversal
- **Structural penalties**: show awareness of distributed systems failure patterns (external API nodes are risky)
- **Data-driven**: the system improves automatically as more executions happen
