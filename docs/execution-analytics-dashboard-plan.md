# Execution Analytics Dashboard — Implementation Plan

## Overview

A read-only analytics dashboard that surfaces meaningful insights from the existing
`Execution` table. No changes to the execution engine are required — this feature
is entirely additive and pulls from data that is already being recorded.

The dashboard answers three questions:
1. How healthy are my workflows overall?
2. Which workflows and node types fail the most?
3. Is performance getting better or worse over time?

---

## What Gets Displayed

### Global Analytics Page `/analytics`

| Section | Content |
|---------|---------|
| Summary cards | Total executions · Overall success rate · Average duration · Active workflows |
| Execution trend chart | Line/bar chart: success vs failure count per day over last 30 days |
| Top failing workflows | Table: workflow name · total runs · fail count · failure rate % |
| Recent executions feed | Last 10 executions across all workflows with status + duration |

### Per-Workflow Analytics Panel (inside editor or workflow detail page)

| Section | Content |
|---------|---------|
| Stats row | Total runs · Success rate · Avg duration · Last run status |
| Execution history chart | Per-day success/failure over last 30 days |
| Node failure breakdown | Which node types fail most (from `NodeExecutionRecord` if available, else from `error` text) |
| Duration trend | Execution time over last N runs (is it getting slower?) |

---

## Data Sources

All data comes from the existing `Execution` model:

```prisma
model Execution {
  id             String          // unique id
  workflowId     String          // which workflow
  status         ExecutionStatus // RUNNING | SUCCESS | FAILED
  error          String?         // error message on failure
  startedAt      DateTime        // when execution started
  completedAt    DateTime?       // when it finished (null if still running)
  output         Json?           // final context output
}
```

Computed fields (not stored, calculated in queries):

```
duration = completedAt - startedAt    (milliseconds)
successRate = SUCCESS count / total count × 100
```

> If `NodeExecutionRecord` is added for the Predictive Risk feature, the per-node
> breakdown section becomes much richer. But this dashboard works without it.

---

## Phase 1 — tRPC Router

**New file:** `src/features/analytics/server/routers.ts`

```ts
export const analyticsRouter = createTRPCRouter({

  // Global summary stats for the current user
  getGlobalStats: protectedProcedure
    .query(async ({ ctx }) => {
      // Returns:
      // - totalExecutions: number
      // - successCount: number
      // - failedCount: number
      // - successRate: number (0–100)
      // - avgDurationMs: number
      // - activeWorkflowCount: number  (workflows with ≥1 execution)
    }),

  // Daily execution counts for the last N days (for trend chart)
  getExecutionTrend: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      // Returns array of:
      // { date: string (YYYY-MM-DD), successCount: number, failedCount: number }
      // One entry per day, 0-filled for days with no executions
    }),

  // Per-workflow aggregated stats for the top N failing workflows
  getTopFailingWorkflows: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      // Returns array of:
      // { workflowId, workflowName, totalRuns, failedRuns, failureRate }
      // Sorted by failureRate descending
    }),

  // Stats for a single workflow
  getWorkflowStats: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Returns:
      // - totalRuns, successCount, failedCount, successRate
      // - avgDurationMs
      // - lastRunStatus, lastRunAt
      // - recentExecutions: last 20 executions with status + duration
    }),

  // Per-day trend for a single workflow
  getWorkflowTrend: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
      days: z.number().min(7).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      // Same shape as getExecutionTrend but filtered to one workflow
    }),

  // Duration trend — execution time over last N runs (for performance chart)
  getDurationTrend: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
      limit: z.number().min(5).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      // Returns array of { executionId, startedAt, durationMs }
      // For completed executions only, ordered by startedAt asc
    }),

});
```

**Register in** `src/trpc/routers/_app.ts`:

```ts
import { analyticsRouter } from '@/features/analytics/server/routers';

export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  credentials: credentialsRouter,
  executions: executionsRouter,
  analytics: analyticsRouter,    // add this line
  // risk: riskRouter,           // also add if implementing predictive risk
});
```

---

## Phase 2 — React Hooks

**New file:** `src/features/analytics/hooks/use-analytics.ts`

```ts
export const useGlobalStats = () =>
  trpc.analytics.getGlobalStats.useQuery();

export const useExecutionTrend = (days = 30) =>
  trpc.analytics.getExecutionTrend.useQuery({ days });

export const useTopFailingWorkflows = (limit = 5) =>
  trpc.analytics.getTopFailingWorkflows.useQuery({ limit });

export const useWorkflowStats = (workflowId: string) =>
  trpc.analytics.getWorkflowStats.useQuery({ workflowId });

export const useWorkflowTrend = (workflowId: string, days = 30) =>
  trpc.analytics.getWorkflowTrend.useQuery({ workflowId, days });

export const useDurationTrend = (workflowId: string, limit = 20) =>
  trpc.analytics.getDurationTrend.useQuery({ workflowId, limit });
```

---

## Phase 3 — Chart Component

The project already uses a modern React stack. Use **Recharts** for charts — it is
lightweight, works with Next.js SSR, and requires no additional auth or API keys.

Install:
```bash
npm install recharts
```

**New file:** `src/features/analytics/components/execution-trend-chart.tsx`

Renders a `ComposedChart` from Recharts with:
- Bar series for `failedCount` (red)
- Bar series for `successCount` (green)
- X-axis: date labels
- Tooltip showing exact counts on hover
- Responsive container (fills parent width)

**New file:** `src/features/analytics/components/duration-trend-chart.tsx`

Renders a `LineChart`:
- X-axis: execution number (1, 2, 3…)
- Y-axis: duration in seconds
- Tooltip: exact duration + timestamp
- Reference line at the average duration

---

## Phase 4 — Summary Stat Cards

**New file:** `src/features/analytics/components/stats-card.tsx`

A reusable card showing one metric:

```tsx
<StatsCard
  label="Success Rate"
  value="87.3%"
  trend="+2.1% vs last week"
  trendDirection="up"
  icon={CheckCircle}
/>
```

Four instances used side-by-side on the analytics page:
- Total Executions
- Success Rate
- Avg Duration
- Active Workflows

---

## Phase 5 — Top Failing Workflows Table

**New file:** `src/features/analytics/components/top-failing-table.tsx`

A simple table with columns:
| Workflow | Total Runs | Failed | Failure Rate | Action |
|----------|-----------|--------|--------------|--------|

The "Action" column links to the workflow editor (`/workflows/[id]`).
Failure rate cell is colour-coded: green < 20%, yellow 20–50%, red > 50%.

---

## Phase 6 — Global Analytics Page

**New file:** `src/app/(dashboard)/(rest)/analytics/page.tsx`

Page layout (top to bottom):
1. Page heading "Analytics"
2. Four `<StatsCard>` components in a grid row
3. "Execution Trend (Last 30 Days)" — `<ExecutionTrendChart>`
4. "Top Failing Workflows" — `<TopFailingTable>`
5. "Recent Executions" — reuse existing executions list component or render inline

This page uses `useSuspenseQuery` with `<Suspense>` boundaries and skeleton placeholders,
matching the pattern used in existing pages like `executions/page.tsx`.

Add the page link to the existing dashboard sidebar navigation.

---

## Phase 7 — Per-Workflow Analytics Panel

**New file:** `src/features/analytics/components/workflow-analytics-panel.tsx`

A collapsible panel or tab rendered inside the workflow editor or on the workflow detail page.

Sections:
1. Stats row (4 numbers: total / success / failed / avg duration)
2. `<ExecutionTrendChart>` for this workflow
3. `<DurationTrendChart>` for this workflow
4. Last 5 executions mini-list with status badges and durations

**Where to show it:**  
Add a "Analytics" tab or expandable section in the workflow editor's right panel, next to
the existing "Add Node" panel. This keeps everything accessible without leaving the editor.

---

## File Structure Summary

```
src/
├── features/
│   └── analytics/
│       ├── server/
│       │   └── routers.ts                   ← tRPC procedures (all DB queries here)
│       ├── hooks/
│       │   └── use-analytics.ts             ← tRPC query hooks
│       └── components/
│           ├── stats-card.tsx               ← single metric card
│           ├── execution-trend-chart.tsx    ← success/fail bar chart (Recharts)
│           ├── duration-trend-chart.tsx     ← execution time line chart (Recharts)
│           ├── top-failing-table.tsx        ← worst-performing workflows table
│           └── workflow-analytics-panel.tsx ← per-workflow panel for editor
├── app/(dashboard)/(rest)/
│   └── analytics/
│       └── page.tsx                         ← global analytics dashboard page
```

---

## Existing Files Modified

| File | Change |
|------|--------|
| `src/trpc/routers/_app.ts` | Register `analyticsRouter` |
| `src/app/(dashboard)/(rest)/layout.tsx` | Add "Analytics" link to sidebar nav |
| `src/features/editor/components/editor.tsx` | Add analytics panel tab (optional) |

No changes to the execution engine, Prisma schema, or any existing feature.

---

## No Database Migration Required

This feature queries only the existing `Execution` table. Zero schema changes.

If `NodeExecutionRecord` is added for the Predictive Risk feature, the analytics
router can optionally add a node-type breakdown query on top — but it is not required.

---

## Implementation Order

1. tRPC router — `getGlobalStats` and `getWorkflowStats` first (easiest, highest value)
2. Hooks file
3. `stats-card.tsx` component
4. Analytics page skeleton with just the stat cards (already useful)
5. Install Recharts + build `execution-trend-chart.tsx`
6. Add trend chart to analytics page
7. `top-failing-table.tsx`
8. `duration-trend-chart.tsx`
9. Per-workflow analytics panel in editor
10. Add nav link

---

## Academic Talking Points

- **Zero-risk addition**: no existing functionality can break because this is read-only
- **Real data only**: every number shown is a direct database aggregate — fully auditable
- **Performance awareness**: duration trend chart demonstrates understanding of execution performance monitoring
- **Practical value**: a production automation tool without analytics is incomplete — this makes the platform enterprise-grade
- **Pairs with Predictive Risk**: the analytics dashboard is the "evidence" that makes the risk scores believable — show both features together in the demo
