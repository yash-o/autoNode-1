"use client";

import { formatDistanceToNow } from "date-fns";
import {
  ActivityIcon,
  CheckCircle2Icon,
  ClockIcon,
  GitBranchIcon,
  Loader2Icon,
  ShieldAlertIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatsCard } from "@/features/analytics/components/stats-card";
import { WorkflowAnalyticsPanel } from "@/features/analytics/components/workflow-analytics-panel";
import { useWorkflowStats } from "@/features/analytics/hooks/use-analytics";
import { formatDuration } from "@/features/analytics/lib/format";
import { useSuspenseWorkflow } from "@/features/workflows/hooks/use-workflows";
import { ExecutionStatus } from "@/generated/prisma";
import { useSuspenseWorkflowRisk } from "../hooks/use-workflow-risk";
import { RiskBadge } from "./risk-badge";
import { RiskPanel } from "./risk-panel";

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

export const RiskPageContent = ({ workflowId }: { workflowId: string }) => {
  const { data: workflow } = useSuspenseWorkflow(workflowId);
  const { data: risk } = useSuspenseWorkflowRisk(workflowId);
  const stats = useWorkflowStats(workflowId);

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-6 p-4 md:px-10 md:py-6">
      <div className="space-y-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/workflows" prefetch>
                  Workflows
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/workflows/${workflowId}`} prefetch>
                  {workflow.name}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>Risk report</BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Risk report</h1>
            <p className="text-sm text-muted-foreground">
              Predictive failure analysis for {workflow.name}, calculated from
              real execution history.
            </p>
          </div>
          <RiskBadge
            level={risk.riskLevel}
            score={risk.workflowRiskScore}
            noData={risk.totalRuns === 0}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Risk Score"
          value={`${risk.workflowRiskScore}/100`}
          hint={`${risk.riskLevel} risk`}
          icon={ShieldAlertIcon}
          tone={
            risk.riskLevel === "high"
              ? "danger"
              : risk.riskLevel === "medium"
                ? "warning"
                : "success"
          }
        />
        <StatsCard
          label="Total Runs"
          value={String(risk.totalRuns)}
          hint={`${risk.failedRuns} failed`}
          icon={ActivityIcon}
        />
        <StatsCard
          label="Success Rate"
          value={`${risk.successRate}%`}
          hint={`${risk.nodeRisks.length} nodes`}
          icon={CheckCircle2Icon}
        />
        <StatsCard
          label="Longest Chain"
          value={String(risk.longestChain)}
          hint={`${risk.missingFallbacks} missing fallback${
            risk.missingFallbacks === 1 ? "" : "s"
          }`}
          icon={GitBranchIcon}
        />
      </div>

      <RiskPanel workflowId={workflowId} />

      <WorkflowAnalyticsPanel workflowId={workflowId} />

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Execution history</h2>
          <p className="text-sm text-muted-foreground">Last 20 runs</p>
        </div>
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!stats.data || stats.data.recentExecutions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No executions recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                stats.data.recentExecutions.map((execution) => (
                  <TableRow key={execution.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 capitalize">
                        {statusIcon(execution.status)}
                        {execution.status.toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(execution.startedAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDuration(execution.durationMs)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/executions/${execution.id}`}
                        prefetch
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};
