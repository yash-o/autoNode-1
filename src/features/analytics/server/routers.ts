import { format, startOfDay, subDays } from "date-fns";
import z from "zod";
import {
  ExecutionStatus,
  NodeExecutionStatus,
  type NodeType,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const durationMs = (execution: {
  startedAt: Date;
  completedAt: Date | null;
}): number | null => {
  if (!execution.completedAt) return null;
  return (
    new Date(execution.completedAt).getTime() -
    new Date(execution.startedAt).getTime()
  );
};

const averageDuration = (
  executions: { startedAt: Date; completedAt: Date | null }[],
): number => {
  const durations = executions
    .map(durationMs)
    .filter((duration): duration is number => duration !== null);

  if (durations.length === 0) return 0;

  return Math.round(
    durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
  );
};

const buildDailyTrend = (
  executions: { status: ExecutionStatus; startedAt: Date }[],
  days: number,
) => {
  const buckets = new Map<
    string,
    { date: string; successCount: number; failedCount: number }
  >();

  const today = startOfDay(new Date());

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = format(subDays(today, index), "yyyy-MM-dd");
    buckets.set(date, { date, successCount: 0, failedCount: 0 });
  }

  for (const execution of executions) {
    const key = format(execution.startedAt, "yyyy-MM-dd");
    const bucket = buckets.get(key);
    if (!bucket) continue;

    if (execution.status === ExecutionStatus.SUCCESS) {
      bucket.successCount += 1;
    } else if (execution.status === ExecutionStatus.FAILED) {
      bucket.failedCount += 1;
    }
  }

  return [...buckets.values()];
};

const ensureWorkflowOwnership = async (workflowId: string, userId: string) => {
  return prisma.workflow.findUniqueOrThrow({
    where: { id: workflowId, userId },
    select: { id: true, name: true },
  });
};

export const analyticsRouter = createTRPCRouter({
  getGlobalStats: protectedProcedure.query(async ({ ctx }) => {
    const executions = await prisma.execution.findMany({
      where: { workflow: { userId: ctx.auth.user.id } },
      select: {
        workflowId: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });

    const totalExecutions = executions.length;
    const successCount = executions.filter(
      (execution) => execution.status === ExecutionStatus.SUCCESS,
    ).length;
    const failedCount = executions.filter(
      (execution) => execution.status === ExecutionStatus.FAILED,
    ).length;
    const runningCount = executions.filter(
      (execution) => execution.status === ExecutionStatus.RUNNING,
    ).length;

    return {
      totalExecutions,
      successCount,
      failedCount,
      runningCount,
      successRate:
        totalExecutions > 0
          ? Math.round((successCount / totalExecutions) * 1000) / 10
          : 0,
      avgDurationMs: averageDuration(executions),
      activeWorkflowCount: new Set(
        executions.map((execution) => execution.workflowId),
      ).size,
    };
  }),

  getExecutionTrend: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = startOfDay(subDays(new Date(), input.days - 1));

      const executions = await prisma.execution.findMany({
        where: {
          workflow: { userId: ctx.auth.user.id },
          startedAt: { gte: since },
        },
        select: {
          status: true,
          startedAt: true,
        },
      });

      return buildDailyTrend(executions, input.days);
    }),

  getTopFailingWorkflows: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      const groups = await prisma.execution.groupBy({
        by: ["workflowId", "status"],
        where: { workflow: { userId: ctx.auth.user.id } },
        _count: { _all: true },
      });

      const byWorkflow = new Map<
        string,
        { totalRuns: number; failedRuns: number }
      >();

      for (const group of groups) {
        const stats = byWorkflow.get(group.workflowId) ?? {
          totalRuns: 0,
          failedRuns: 0,
        };

        stats.totalRuns += group._count._all;
        if (group.status === ExecutionStatus.FAILED) {
          stats.failedRuns += group._count._all;
        }

        byWorkflow.set(group.workflowId, stats);
      }

      if (byWorkflow.size === 0) {
        return [];
      }

      const workflows = await prisma.workflow.findMany({
        where: {
          id: { in: [...byWorkflow.keys()] },
          userId: ctx.auth.user.id,
        },
        select: { id: true, name: true },
      });

      return workflows
        .map((workflow) => {
          const stats = byWorkflow.get(workflow.id) ?? {
            totalRuns: 0,
            failedRuns: 0,
          };

          return {
            workflowId: workflow.id,
            workflowName: workflow.name,
            totalRuns: stats.totalRuns,
            failedRuns: stats.failedRuns,
            failureRate:
              stats.totalRuns > 0
                ? Math.round((stats.failedRuns / stats.totalRuns) * 1000) / 10
                : 0,
          };
        })
        .filter((workflow) => workflow.failedRuns > 0)
        .sort(
          (a, b) => b.failureRate - a.failureRate || b.totalRuns - a.totalRuns,
        )
        .slice(0, input.limit);
    }),

  getWorkflowStats: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ ctx, input }) => {
      const workflow = await ensureWorkflowOwnership(
        input.workflowId,
        ctx.auth.user.id,
      );

      const [executions, recentExecutions] = await Promise.all([
        prisma.execution.findMany({
          where: { workflowId: workflow.id },
          select: { status: true, startedAt: true, completedAt: true },
        }),
        prisma.execution.findMany({
          where: { workflowId: workflow.id },
          orderBy: { startedAt: "desc" },
          take: 20,
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        }),
      ]);

      const totalRuns = executions.length;
      const successCount = executions.filter(
        (execution) => execution.status === ExecutionStatus.SUCCESS,
      ).length;
      const failedCount = executions.filter(
        (execution) => execution.status === ExecutionStatus.FAILED,
      ).length;

      return {
        workflowId: workflow.id,
        workflowName: workflow.name,
        totalRuns,
        successCount,
        failedCount,
        successRate:
          totalRuns > 0
            ? Math.round((successCount / totalRuns) * 1000) / 10
            : 0,
        avgDurationMs: averageDuration(executions),
        lastRunStatus: recentExecutions[0]?.status ?? null,
        lastRunAt: recentExecutions[0]?.startedAt ?? null,
        recentExecutions: recentExecutions.map((execution) => ({
          id: execution.id,
          status: execution.status,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          durationMs: durationMs(execution),
        })),
      };
    }),

  getWorkflowTrend: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
        days: z.number().min(7).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureWorkflowOwnership(input.workflowId, ctx.auth.user.id);

      const since = startOfDay(subDays(new Date(), input.days - 1));

      const executions = await prisma.execution.findMany({
        where: {
          workflowId: input.workflowId,
          startedAt: { gte: since },
        },
        select: { status: true, startedAt: true },
      });

      return buildDailyTrend(executions, input.days);
    }),

  getDurationTrend: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
        limit: z.number().min(5).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureWorkflowOwnership(input.workflowId, ctx.auth.user.id);

      const executions = await prisma.execution.findMany({
        where: {
          workflowId: input.workflowId,
          completedAt: { not: null },
        },
        orderBy: { startedAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          startedAt: true,
          completedAt: true,
        },
      });

      return executions
        .map((execution) => ({
          executionId: execution.id,
          startedAt: execution.startedAt,
          durationMs: durationMs(execution) ?? 0,
        }))
        .reverse();
    }),

  getNodeFailureBreakdown: protectedProcedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureWorkflowOwnership(input.workflowId, ctx.auth.user.id);

      const groups = await prisma.nodeExecutionRecord.groupBy({
        by: ["nodeType", "status"],
        where: { workflowId: input.workflowId },
        _count: { _all: true },
      });

      const byType = new Map<
        NodeType,
        { nodeType: NodeType; totalRuns: number; failedRuns: number }
      >();

      for (const group of groups) {
        const stats = byType.get(group.nodeType) ?? {
          nodeType: group.nodeType,
          totalRuns: 0,
          failedRuns: 0,
        };

        stats.totalRuns += group._count._all;
        if (group.status === NodeExecutionStatus.FAILED) {
          stats.failedRuns += group._count._all;
        }

        byType.set(group.nodeType, stats);
      }

      return [...byType.values()]
        .map((stats) => ({
          ...stats,
          failureRate:
            stats.totalRuns > 0
              ? Math.round((stats.failedRuns / stats.totalRuns) * 1000) / 10
              : 0,
        }))
        .sort((a, b) => b.failureRate - a.failureRate);
    }),

  getRecentExecutions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      return prisma.execution.findMany({
        where: { workflow: { userId: ctx.auth.user.id } },
        orderBy: { startedAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          workflow: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }),
});
