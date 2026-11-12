import { prefetch, trpc } from "@/trpc/server";

export const prefetchGlobalAnalytics = () => {
  prefetch(trpc.analytics.getGlobalStats.queryOptions());
  prefetch(trpc.analytics.getExecutionTrend.queryOptions({ days: 30 }));
  prefetch(trpc.analytics.getTopFailingWorkflows.queryOptions({ limit: 5 }));
  prefetch(trpc.analytics.getRecentExecutions.queryOptions({ limit: 10 }));
};

export const prefetchWorkflowAnalytics = (workflowId: string) => {
  prefetch(trpc.analytics.getWorkflowStats.queryOptions({ workflowId }));
  prefetch(
    trpc.analytics.getWorkflowTrend.queryOptions({ workflowId, days: 30 }),
  );
  prefetch(
    trpc.analytics.getDurationTrend.queryOptions({ workflowId, limit: 20 }),
  );
  prefetch(trpc.analytics.getNodeFailureBreakdown.queryOptions({ workflowId }));
};
