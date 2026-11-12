"use client";

import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  Loader2Icon,
  ShieldAlertIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useWorkflowRisk } from "../hooks/use-workflow-risk";
import { formatNodeType, MIN_RUNS_FOR_ANALYSIS } from "../lib/compute-risk";
import { RiskBadge } from "./risk-badge";

const scoreBarColor = (score: number) =>
  score > 60 ? "bg-red-500" : score > 30 ? "bg-amber-500" : "bg-green-500";

const scoreTextColor = (score: number) =>
  score > 60
    ? "text-red-600 dark:text-red-400"
    : score > 30
      ? "text-amber-600 dark:text-amber-400"
      : "text-green-600 dark:text-green-400";

interface RiskPanelProps {
  workflowId: string;
  className?: string;
  showReportLink?: boolean;
}

export const RiskPanel = ({
  workflowId,
  className,
  showReportLink = false,
}: RiskPanelProps) => {
  const { data: report, isLoading, error } = useWorkflowRisk(workflowId);

  if (isLoading) {
    return (
      <Card className={cn("shadow-none", className)}>
        <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Calculating risk…
        </CardContent>
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Card className={cn("shadow-none", className)}>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Unable to calculate risk right now.
        </CardContent>
      </Card>
    );
  }

  const hasEnoughData = report.totalRuns >= MIN_RUNS_FOR_ANALYSIS;
  const nodeRisks = [...report.nodeRisks].sort(
    (a, b) => b.riskScore - a.riskScore,
  );

  return (
    <Card className={cn("shadow-none", className)}>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlertIcon className="size-4 text-muted-foreground" />
              Failure Risk
            </CardTitle>
            <CardDescription>
              {report.totalRuns} run{report.totalRuns === 1 ? "" : "s"} ·{" "}
              {report.successRate}% success rate
            </CardDescription>
          </div>
          <RiskBadge
            level={report.riskLevel}
            score={report.workflowRiskScore}
            noData={!hasEnoughData}
          />
        </div>

        <div className="flex items-end justify-between gap-3">
          <span
            className={cn(
              "text-3xl font-semibold tabular-nums",
              scoreTextColor(report.workflowRiskScore),
            )}
          >
            {report.workflowRiskScore}
            <span className="text-base font-normal text-muted-foreground">
              /100
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {report.longestChain} node chain · {report.missingFallbacks} missing
            fallback{report.missingFallbacks === 1 ? "" : "s"}
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              scoreBarColor(report.workflowRiskScore),
            )}
            style={{ width: `${report.workflowRiskScore}%` }}
          />
        </div>

        {!hasEnoughData && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {report.totalRuns} of {MIN_RUNS_FOR_ANALYSIS} minimum runs
            collected. Scores become more reliable as this workflow executes.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <h3 className="mb-2 text-sm font-medium">Node risk</h3>
          {nodeRisks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This workflow has no nodes.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Node</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nodeRisks.map((nodeRisk) => (
                    <TableRow key={nodeRisk.nodeId}>
                      <TableCell className="font-medium">
                        {formatNodeType(nodeRisk.nodeType)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {nodeRisk.totalRuns}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {nodeRisk.failedRuns}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          nodeRisk.totalRuns > 0
                            ? scoreTextColor(nodeRisk.riskScore)
                            : "text-muted-foreground",
                        )}
                      >
                        {nodeRisk.totalRuns > 0
                          ? `${nodeRisk.riskScore}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">Recommendations</h3>
          <ul className="space-y-2">
            {report.recommendations.map((recommendation) => (
              <li
                key={recommendation}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>{recommendation}</span>
              </li>
            ))}
          </ul>
        </div>

        {showReportLink && (
          <Link
            href={`/workflows/${workflowId}/risk`}
            prefetch
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Open full risk report
            <ArrowUpRightIcon className="size-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
};
