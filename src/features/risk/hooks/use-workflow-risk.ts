"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

/**
 * Fetch the full risk report for a workflow (non-suspending, for editor panels).
 */
export const useWorkflowRisk = (workflowId: string) => {
  const trpc = useTRPC();
  return useQuery(trpc.risk.getWorkflowRisk.queryOptions({ workflowId }));
};

/**
 * Suspense variant used by the dedicated risk page.
 */
export const useSuspenseWorkflowRisk = (workflowId: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(
    trpc.risk.getWorkflowRisk.queryOptions({ workflowId }),
  );
};

/**
 * Lightweight risk summaries for workflow cards.
 */
export const useManyRiskSummaries = (workflowIds: string[]) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.risk.getManyRiskSummaries.queryOptions({ workflowIds }),
    enabled: workflowIds.length > 0,
  });
};
