import { prefetch, trpc } from "@/trpc/server";

/**
 * Prefetch the risk report for one workflow.
 */
export const prefetchWorkflowRisk = (workflowId: string) => {
  return prefetch(trpc.risk.getWorkflowRisk.queryOptions({ workflowId }));
};
