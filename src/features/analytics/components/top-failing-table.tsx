"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type FailingWorkflow = {
  workflowId: string;
  workflowName: string;
  totalRuns: number;
  failedRuns: number;
  failureRate: number;
};

const failureRateColor = (failureRate: number) => {
  if (failureRate > 50) return "text-red-600 dark:text-red-400";
  if (failureRate >= 20) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
};

interface TopFailingTableProps {
  data: FailingWorkflow[];
}

export const TopFailingTable = ({ data }: TopFailingTableProps) => {
  return (
    <div className="rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead className="text-right">Total Runs</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead className="text-right">Failure Rate</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-8 text-center text-muted-foreground"
              >
                No failing workflows. Everything looks healthy.
              </TableCell>
            </TableRow>
          ) : (
            data.map((workflow) => (
              <TableRow key={workflow.workflowId}>
                <TableCell className="font-medium">
                  {workflow.workflowName}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {workflow.totalRuns}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {workflow.failedRuns}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    failureRateColor(workflow.failureRate),
                  )}
                >
                  {workflow.failureRate}%
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/workflows/${workflow.workflowId}`}
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
  );
};
