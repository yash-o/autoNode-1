import { NodeType } from "@/generated/prisma";

export type RiskLevel = "low" | "medium" | "high";

export type NodeStats = {
  nodeType: NodeType;
  totalRuns: number;
  failedRuns: number;
};

export type NodeRisk = {
  nodeId: string;
  nodeType: NodeType;
  totalRuns: number;
  failedRuns: number;
  failureRate: number; // 0.0 – 1.0
  riskScore: number; // 0 – 100
};

export type WorkflowRiskReport = {
  workflowRiskScore: number; // 0 – 100
  riskLevel: RiskLevel;
  nodeRisks: NodeRisk[];
  recommendations: string[];
  totalRuns: number;
  failedRuns: number;
  successRate: number; // 0 – 100
  longestChain: number;
  missingFallbacks: number;
};

type WorkflowNode = { id: string; type: NodeType };
type WorkflowConnection = { fromNodeId: string; toNodeId: string };

/** Minimum number of executions before the risk score is meaningful. */
export const MIN_RUNS_FOR_ANALYSIS = 3;

/** Nodes that call an external service and can fail for reasons outside our control. */
export const EXTERNAL_NODE_TYPES = new Set<NodeType>([
  NodeType.HTTP_REQUEST,
  NodeType.GMAIL,
  NodeType.DISCORD,
  NodeType.SLACK,
  NodeType.GOOGLE_SHEETS,
  NodeType.OPENAI,
  NodeType.GEMINI,
  NodeType.ANTHROPIC,
]);

export const getRiskLevel = (score: number): RiskLevel => {
  if (score > 60) return "high";
  if (score > 30) return "medium";
  return "low";
};

/**
 * Length of the longest sequential path through the workflow graph.
 * Cycles are tolerated (they should not exist, but a bad save must not hang the
 * risk query) by stopping at the first repeated node.
 */
export const computeLongestChain = (
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
): number => {
  if (nodes.length === 0) return 0;

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const connection of connections) {
    adjacency.get(connection.fromNodeId)?.push(connection.toNodeId);
  }

  const memo = new Map<string, number>();

  const longestFrom = (nodeId: string, visiting: Set<string>): number => {
    const cached = memo.get(nodeId);
    if (cached !== undefined) return cached;
    if (visiting.has(nodeId)) return 1;
    visiting.add(nodeId);

    const children = adjacency.get(nodeId) ?? [];
    let longest = 1;
    for (const child of children) {
      longest = Math.max(longest, 1 + longestFrom(child, visiting));
    }

    visiting.delete(nodeId);
    memo.set(nodeId, longest);
    return longest;
  };

  let longest = 0;
  for (const node of nodes) {
    longest = Math.max(longest, longestFrom(node.id, new Set()));
  }

  return longest;
};

/** External-service nodes that have no outgoing connection (no fallback path). */
export const countMissingFallbacks = (
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
): number => {
  const nodesWithOutgoing = new Set(
    connections.map((connection) => connection.fromNodeId),
  );

  return nodes.filter(
    (node) =>
      EXTERNAL_NODE_TYPES.has(node.type) && !nodesWithOutgoing.has(node.id),
  ).length;
};

const NODE_LABELS: Partial<Record<NodeType, string>> = {
  HTTP_REQUEST: "HTTP Request",
  GMAIL: "Gmail",
  DISCORD: "Discord",
  SLACK: "Slack",
  GOOGLE_SHEETS: "Google Sheets",
  OPENAI: "OpenAI",
  GEMINI: "Gemini",
  ANTHROPIC: "Anthropic",
  FILTER: "Filter",
  ROUTER: "Router",
  MANUAL_TRIGGER: "Manual Trigger",
  GOOGLE_FORM_TRIGGER: "Google Form Trigger",
  STRIPE_TRIGGER: "Stripe Trigger",
  INITIAL: "Initial",
};

export const formatNodeType = (type: NodeType) => NODE_LABELS[type] ?? type;

const nodeLabel = formatNodeType;

const buildRecommendations = (
  nodeRisks: NodeRisk[],
  chainLength: number,
  missingFallbacks: number,
  totalRuns: number,
): string[] => {
  const recommendations: string[] = [];

  if (totalRuns < MIN_RUNS_FOR_ANALYSIS) {
    recommendations.push(
      `Only ${totalRuns} execution${totalRuns === 1 ? "" : "s"} recorded so far. Run this workflow at least ${MIN_RUNS_FOR_ANALYSIS} times to make the risk score reliable.`,
    );
  }

  // One recommendation per node type, using the worst node of that type.
  const worstByType = new Map<NodeType, NodeRisk>();
  for (const nodeRisk of nodeRisks) {
    if (nodeRisk.totalRuns === 0) continue;
    const current = worstByType.get(nodeRisk.nodeType);
    if (!current || nodeRisk.failureRate > current.failureRate) {
      worstByType.set(nodeRisk.nodeType, nodeRisk);
    }
  }

  for (const nodeRisk of [...worstByType.values()].sort(
    (a, b) => b.failureRate - a.failureRate,
  )) {
    if (nodeRisk.failureRate < 0.2) continue;

    const percent = Math.round(nodeRisk.failureRate * 100);
    recommendations.push(
      `${nodeLabel(nodeRisk.nodeType)} failed in ${nodeRisk.failedRuns} of ${nodeRisk.totalRuns} runs (${percent}%). Check its credentials, configuration and upstream output.`,
    );
  }

  if (chainLength > 3) {
    recommendations.push(
      `This workflow has a ${chainLength}-step sequential chain. Long chains amplify failures — consider splitting it into smaller workflows or adding retries.`,
    );
  }

  if (missingFallbacks > 0) {
    recommendations.push(
      `${missingFallbacks} external-service node${missingFallbacks === 1 ? " has" : "s have"} no fallback path. Add an error-handling or notification branch after ${missingFallbacks === 1 ? "it" : "them"}.`,
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "No significant risks detected. Keep monitoring as more executions are recorded.",
    );
  }

  return recommendations;
};

/**
 * Pure risk calculation — no database access. Callers pass in workflow
 * structure plus pre-aggregated execution counts.
 */
export const computeWorkflowRisk = (
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
  nodeStats: NodeStats[],
  executionStats: { total: number; failed: number },
): WorkflowRiskReport => {
  const statsByType = new Map(
    nodeStats.map((stats) => [stats.nodeType, stats]),
  );

  const nodeRisks: NodeRisk[] = nodes.map((node) => {
    const stats = statsByType.get(node.type);
    const totalRuns = stats?.totalRuns ?? 0;
    const failedRuns = stats?.failedRuns ?? 0;
    const failureRate = totalRuns > 0 ? failedRuns / totalRuns : 0;

    return {
      nodeId: node.id,
      nodeType: node.type,
      totalRuns,
      failedRuns,
      failureRate,
      riskScore: Math.round(failureRate * 100),
    };
  });

  const baseScore =
    nodeRisks.length > 0
      ? nodeRisks.reduce((sum, nodeRisk) => sum + nodeRisk.riskScore, 0) /
        nodeRisks.length
      : 0;

  const longestChain = computeLongestChain(nodes, connections);
  const chainPenalty =
    longestChain > 3 ? Math.min(20, (longestChain - 3) * 2) : 0;

  const missingFallbacks = countMissingFallbacks(nodes, connections);
  const missingHandlerPenalty = Math.min(20, missingFallbacks * 5);

  const workflowRiskScore = Math.min(
    100,
    Math.round(baseScore + chainPenalty + missingHandlerPenalty),
  );

  const successRate =
    executionStats.total > 0
      ? ((executionStats.total - executionStats.failed) /
          executionStats.total) *
        100
      : 0;

  return {
    workflowRiskScore,
    riskLevel: getRiskLevel(workflowRiskScore),
    nodeRisks,
    recommendations: buildRecommendations(
      nodeRisks,
      longestChain,
      missingFallbacks,
      executionStats.total,
    ),
    totalRuns: executionStats.total,
    failedRuns: executionStats.failed,
    successRate: Math.round(successRate * 10) / 10,
    longestChain,
    missingFallbacks,
  };
};
