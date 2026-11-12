import z from "zod";
import { NodeExecutionStatus, type NodeType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { computeWorkflowRisk, type NodeStats } from "../lib/compute-risk";

const buildNodeStats = (
  records: {
    nodeType: NodeType;
    status: NodeExecutionStatus;
    _count: { _all: number };
  }[],
): NodeStats[] => {
  const statsByType = new Map<NodeType, NodeStats>();

  for (const record of records) {
    const stats = statsByType.get(record.nodeType) ?? {
      nodeType: record.nodeType,
      totalRuns: 0,
      failedRuns: 0,
    };

    stats.totalRuns += record._count._all;
    if (record.status === NodeExecutionStatus.FAILED) {
      stats.failedRuns += record._count._all;
    }

    statsByType.set(record.nodeType, stats);
  }

  return [...statsByType.values()];
};

export const riskRouter = createTRPCRouter({
  getWorkflowRisk: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ ctx, input }) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: {
          id: input.workflowId,
          userId: ctx.auth.user.id,
        },
        include: {
          nodes: true,
          connections: true,
        },
      });

      const [nodeRecords, executionGroups] = await Promise.all([
        prisma.nodeExecutionRecord.groupBy({
          by: ["nodeType", "status"],
          where: { workflowId: workflow.id },
          _count: { _all: true },
        }),
        prisma.execution.groupBy({
          by: ["status"],
          where: { workflowId: workflow.id },
          _count: { _all: true },
        }),
      ]);

      const totalRuns = executionGroups.reduce(
        (sum, group) => sum + group._count._all,
        0,
      );
      const failedRuns = executionGroups
        .filter((group) => group.status === "FAILED")
        .reduce((sum, group) => sum + group._count._all, 0);

      const report = computeWorkflowRisk(
        workflow.nodes.map((node) => ({ id: node.id, type: node.type })),
        workflow.connections.map((connection) => ({
          fromNodeId: connection.fromNodeId,
          toNodeId: connection.toNodeId,
        })),
        buildNodeStats(nodeRecords),
        { total: totalRuns, failed: failedRuns },
      );

      return {
        workflowId: workflow.id,
        workflowName: workflow.name,
        ...report,
      };
    }),

  getManyRiskSummaries: protectedProcedure
    .input(z.object({ workflowIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const workflowIds = [...new Set(input.workflowIds)];
      if (workflowIds.length === 0) {
        return [];
      }

      const workflows = await prisma.workflow.findMany({
        where: {
          id: { in: workflowIds },
          userId: ctx.auth.user.id,
        },
        include: {
          nodes: true,
          connections: true,
        },
      });

      if (workflows.length === 0) {
        return [];
      }

      const ownedIds = workflows.map((workflow) => workflow.id);

      const [nodeRecords, executionGroups] = await Promise.all([
        prisma.nodeExecutionRecord.groupBy({
          by: ["workflowId", "nodeType", "status"],
          where: { workflowId: { in: ownedIds } },
          _count: { _all: true },
        }),
        prisma.execution.groupBy({
          by: ["workflowId", "status"],
          where: { workflowId: { in: ownedIds } },
          _count: { _all: true },
        }),
      ]);

      return workflows.map((workflow) => {
        const nodeStats = buildNodeStats(
          nodeRecords.filter((record) => record.workflowId === workflow.id),
        );

        const executionCounts = executionGroups.filter(
          (group) => group.workflowId === workflow.id,
        );
        const totalRuns = executionCounts.reduce(
          (sum, group) => sum + group._count._all,
          0,
        );
        const failedRuns = executionCounts
          .filter((group) => group.status === "FAILED")
          .reduce((sum, group) => sum + group._count._all, 0);

        const report = computeWorkflowRisk(
          workflow.nodes.map((node) => ({ id: node.id, type: node.type })),
          workflow.connections.map((connection) => ({
            fromNodeId: connection.fromNodeId,
            toNodeId: connection.toNodeId,
          })),
          nodeStats,
          { total: totalRuns, failed: failedRuns },
        );

        return {
          workflowId: workflow.id,
          riskScore: report.workflowRiskScore,
          riskLevel: report.riskLevel,
          totalRuns: report.totalRuns,
        };
      });
    }),
});
