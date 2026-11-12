"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

export const useGlobalStats = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.analytics.getGlobalStats.queryOptions());
};

export const useExecutionTrend = (days = 30) => {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.analytics.getExecutionTrend.queryOptions({ days }),
  );
};

export const useTopFailingWorkflows = (limit = 5) => {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.analytics.getTopFailingWorkflows.queryOptions({ limit }),
  );
};

export const useRecentExecutions = (limit = 10) => {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.analytics.getRecentExecutions.queryOptions({ limit }),
  );
};

export const useWorkflowStats = (workflowId: string) => {
  const trpc = useTRPC();
  return useQuery(trpc.analytics.getWorkflowStats.queryOptions({ workflowId }));
};

export const useWorkflowTrend = (workflowId: string, days = 30) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.analytics.getWorkflowTrend.queryOptions({ workflowId, days }),
  );
};

export const useDurationTrend = (workflowId: string, limit = 20) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.analytics.getDurationTrend.queryOptions({ workflowId, limit }),
  );
};

export const useNodeFailureBreakdown = (workflowId: string) => {
  const trpc = useTRPC();
  return useQuery(
    trpc.analytics.getNodeFailureBreakdown.queryOptions({ workflowId }),
  );
};
