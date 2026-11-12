import { AlertTriangleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "../lib/compute-risk";

const LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const LEVEL_STYLES: Record<RiskLevel, string> = {
  low: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
  medium:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  high: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  noData?: boolean;
  className?: string;
}

export const RiskBadge = ({
  level,
  score,
  noData = false,
  className,
}: RiskBadgeProps) => {
  if (noData) {
    return (
      <Badge
        variant="outline"
        className={cn("text-muted-foreground", className)}
      >
        Limited data
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(LEVEL_STYLES[level], className)}
      title={typeof score === "number" ? `Risk score: ${score}/100` : undefined}
    >
      {level === "high" && <AlertTriangleIcon className="size-3" />}
      {LEVEL_LABELS[level]} Risk
      {typeof score === "number" && ` · ${score}`}
    </Badge>
  );
};
