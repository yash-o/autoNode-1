"use client";

import { formatDistanceToNow } from "date-fns";
import {
  ActivityIcon,
  CheckCircle2Icon,
  ClockIcon,
  FolderOpenIcon,
  Loader2Icon,
  TimerIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { ErrorView, LoadingView } from "@/components/entity-components";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExecutionStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import {
  useExecutionTrend,
  useGlobalStats,
  useRecentExecutions,
  useTopFailingWorkflows,
} from "../hooks/use-analytics";
import { formatDuration } from "../lib/format";
import { ExecutionTrendChart } from "./execution-trend-chart";
import { StatsCard } from "./stats-card";
import { TopFailingTable } from "./top-failing-table";

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

export const AnalyticsDashboard = () => {
  const stats = useGlobalStats();
  const trend = useExecutionTrend(30);
  const failing = useTopFailingWorkflows(5);
  const recent = useRecentExecutions(10);

  const successRate = stats.data.successRate;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Executions"
          value={String(stats.data.totalExecutions)}
          hint={`${stats.data.runningCount} running`}
          icon={ActivityIcon}
        />
        <StatsCard
          label="Success Rate"
          value={`${successRate}%`}
          hint={`${stats.data.successCount} succeeded`}
          icon={CheckCircle2Icon}
          tone={
            successRate >= 80
              ? "success"
              : successRate >= 50
                ? "warning"
                : "danger"
          }
        />
        <StatsCard
          label="Avg Duration"
          value={formatDuration(stats.data.avgDurationMs)}
          hint="Completed executions"
          icon={TimerIcon}
        />
        <StatsCard
          label="Active Workflows"
          value={String(stats.data.activeWorkflowCount)}
          hint="With at least one run"
          icon={FolderOpenIcon}
        />
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Execution Trend</CardTitle>
          <CardDescription>
            Success and failure counts over 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExecutionTrendChart data={trend.data} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Top Failing Workflows</h2>
          <p className="text-sm text-muted-foreground">
            Workflows ranked by failure rate
          </p>
        </div>
        <TopFailingTable data={failing.data} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Recent Executions</h2>
          <p className="text-sm text-muted-foreground">
            Latest runs across all workflows
          </p>
        </div>
        <div className="space-y-2">
          {recent.data.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No executions recorded yet.
            </p>
          ) : (
            recent.data.map((execution) => {
              const durationMs = execution.completedAt
                ? new Date(execution.completedAt).getTime() -
                  new Date(execution.startedAt).getTime()
                : null;

              return (
                <Link
                  key={execution.id}
                  href={`/executions/${execution.id}`}
                  prefetch
                  className="flex items-center justify-between gap-3 rounded-md border bg-background px-4 py-3 text-sm hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {statusIcon(execution.status)}
                    <span className="truncate font-medium capitalize">
                      {execution.status.toLowerCase()}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {execution.workflow.name}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {formatDistanceToNow(new Date(execution.startedAt), {
                        addSuffix: true,
                      })}
                    </span>
                    <span className={cn(durationMs === null && "invisible")}>
                      {formatDuration(durationMs)}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};

export const AnalyticsLoading = () => (
  <LoadingView message="Loading analytics..." />
);

export const AnalyticsError = () => (
  <ErrorView message="Error loading analytics" />
);
