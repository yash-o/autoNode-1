"use client";

import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type DurationTrendPoint = {
  executionId: string;
  startedAt: Date | string;
  durationMs: number;
};

const chartConfig = {
  durationSeconds: {
    label: "Duration (s)",
    color: "#6366f1",
  },
} satisfies ChartConfig;

interface DurationTrendChartProps {
  data: DurationTrendPoint[];
  className?: string;
}

export const DurationTrendChart = ({
  data,
  className,
}: DurationTrendChartProps) => {
  const chartData = data.map((point, index) => ({
    run: index + 1,
    durationSeconds: Math.round((point.durationMs / 1000) * 100) / 100,
    startedAt: format(new Date(point.startedAt), "PPp"),
  }));

  const average =
    chartData.length > 0
      ? Math.round(
          (chartData.reduce((sum, point) => sum + point.durationSeconds, 0) /
            chartData.length) *
            100,
        ) / 100
      : 0;

  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto h-[240px] w-full", className)}
    >
      <LineChart
        data={chartData}
        margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="run"
          tickLine={false}
          axisLine={false}
          minTickGap={16}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          tickFormatter={(value: number) => `${value}s`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value, payload) =>
                payload?.[0]?.payload?.startedAt
                  ? `Run ${value} · ${payload[0].payload.startedAt}`
                  : `Run ${value}`
              }
            />
          }
        />
        {average > 0 && (
          <ReferenceLine
            y={average}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            label={{
              value: `avg ${average}s`,
              position: "insideTopRight",
              fontSize: 10,
              fill: "#94a3b8",
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="durationSeconds"
          stroke="var(--color-durationSeconds)"
          strokeWidth={2}
          dot={{ r: 2 }}
        />
      </LineChart>
    </ChartContainer>
  );
};
