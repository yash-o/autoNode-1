"use client";

import { useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { nodeRiskAtom } from "../store/risk-atoms";

/**
 * Small coloured dot rendered in the top-right corner of a node.
 * Reads from nodeRiskAtom so node data saved to the DB stays untouched.
 */
export const NodeRiskOverlay = ({ nodeId }: { nodeId: string }) => {
  const score = useAtomValue(nodeRiskAtom)[nodeId];

  if (score === undefined) return null;

  const color =
    score > 60 ? "bg-red-500" : score > 30 ? "bg-amber-500" : "bg-green-500";

  return (
    <span
      role="img"
      aria-label={`Risk score ${score} out of 100`}
      title={`Risk score: ${score}/100`}
      className={cn(
        "pointer-events-none absolute -top-1 -right-1 z-10 size-2.5 rounded-full ring-2 ring-background",
        color,
      )}
    />
  );
};
