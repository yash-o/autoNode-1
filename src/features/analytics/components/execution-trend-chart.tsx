"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type ExecutionTrendPoint = {
  date: string; // yyyy-MM-dd
  successCount: number;
  failedCount: number;
};

const chartConfig = {
  successCount: {
    label: "Success",
    color: "#16a34a",
  },
  failedCount: {
    label: "Failed",
    color: "#dc2626",
  },
} satisfies ChartConfig;

interface ExecutionTrendChartProps {
  data: ExecutionTrendPoint[];
  className?: string;
}

export const ExecutionTrendChart = ({
  data,
  className,
}: ExecutionTrendChartProps) => {
  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto h-[280px] w-full", className)}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickFormatter={(value: string) => format(parseISO(value), "MMM d")}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => format(parseISO(String(value)), "PPP")}
            />
          }
        />
        <Bar
          dataKey="successCount"
          stackId="executions"
          fill="var(--color-successCount)"
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="failedCount"
          stackId="executions"
          fill="var(--color-failedCount)"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
};
