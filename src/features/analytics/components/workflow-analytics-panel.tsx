"use client";

import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNodeType } from "@/features/risk/lib/compute-risk";
import { ExecutionStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import {
  useDurationTrend,
  useNodeFailureBreakdown,
  useWorkflowStats,
  useWorkflowTrend,
} from "../hooks/use-analytics";
import { formatDuration } from "../lib/format";
import { DurationTrendChart } from "./duration-trend-chart";
import { ExecutionTrendChart } from "./execution-trend-chart";

const statusIcon = (status: ExecutionStatus) => {
  switch (status) {
    case ExecutionStatus.SUCCESS:
      return <CheckCircle2Icon className="size-4 text-green-600" />;
    case ExecutionStatus.FAILED:
      return <XCircleIcon className="size-4 text-red-600" />;
    case ExecutionStatus.RUNNING:
      return <Loader2Icon className="size-4 animate-spin text-blue-600" />;
    default:
      return <ClockIcon className="size-4 text-muted-foreground" />;
  }
};

const failureRateColor = (rate: number) =>
  rate > 50
    ? "text-red-600 dark:text-red-400"
    : rate >= 20
      ? "text-amber-600 dark:text-amber-400"
      : "text-green-600 dark:text-green-400";

interface WorkflowAnalyticsPanelProps {
  workflowId: string;
  className?: string;
}

export const WorkflowAnalyticsPanel = ({
  workflowId,
  className,
}: WorkflowAnalyticsPanelProps) => {
  const stats = useWorkflowStats(workflowId);
  const trend = useWorkflowTrend(workflowId);
  const durationTrend = useDurationTrend(workflowId);
  const breakdown = useNodeFailureBreakdown(workflowId);

  if (stats.isLoading) {
    return (
      <Card className={cn("shadow-none", className)}>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (stats.error || !stats.data) {
    return (
      <Card className={cn("shadow-none", className)}>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Unable to load analytics right now.
        </CardContent>
      </Card>
    );
  }

  const data = stats.data;

  return (
    <div className={cn("space-y-4", className)}>
      <Card className="shadow-none">
        <CardHeader className="gap-1">
          <CardTitle className="text-base">Execution Analytics</CardTitle>
          <CardDescription>
            {data.totalRuns} run{data.totalRuns === 1 ? "" : "s"}
            {data.lastRunAt
              ? ` · last run ${formatDistanceToNow(new Date(data.lastRunAt), {
                  addSuffix: true,
                })}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Total runs</p>
            <p className="text-lg font-semibold tabular-nums">
              {data.totalRuns}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Success rate</p>
            <p className="text-lg font-semibold tabular-nums">
              {data.successRate}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-lg font-semibold tabular-nums">
              {data.failedCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg duration</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatDuration(data.avgDurationMs)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Execution trend (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {trend.data ? (
            <ExecutionTrendChart data={trend.data} />
          ) : (
            <Skeleton className="h-[280px] w-full" />
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Duration trend</CardTitle>
          <CardDescription>Last 20 completed runs</CardDescription>
        </CardHeader>
        <CardContent>
          {durationTrend.data ? (
            <DurationTrendChart data={durationTrend.data} />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Node failure breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {breakdown.data && breakdown.data.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Node type</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Failure rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.data.map((row) => (
                    <TableRow key={row.nodeType}>
                      <TableCell className="font-medium">
                        {formatNodeType(row.nodeType)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.totalRuns}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.failedRuns}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          failureRateColor(row.failureRate),
                        )}
                      >
                        {row.failureRate}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No per-node execution records yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Last 5 executions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.recentExecutions.slice(0, 5).map((execution) => (
            <Link
              key={execution.id}
              href={`/executions/${execution.id}`}
              prefetch
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                {statusIcon(execution.status)}
                <span className="capitalize">
                  {execution.status.toLowerCase()}
                </span>
              </span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {formatDistanceToNow(new Date(execution.startedAt), {
                    addSuffix: true,
                  })}
                </span>
                <span>{formatDuration(execution.durationMs)}</span>
              </span>
            </Link>
          ))}
          {data.recentExecutions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This workflow has not been executed yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
