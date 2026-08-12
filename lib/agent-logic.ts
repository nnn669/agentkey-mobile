export type RoutingStrategy = "priority" | "roundRobin" | "leastUsed";
export type KeyStatus = "healthy" | "cooling" | "disabled";

export type KeyCandidate = {
  id: string;
  priority: number;
  usage: number;
  status: KeyStatus;
};

export function selectKey<T extends KeyCandidate>(keys: T[], strategy: RoutingStrategy): T | undefined {
  const available = keys.filter((key) => key.status === "healthy");

  if (!available.length) return undefined;

  if (strategy === "leastUsed") {
    return [...available].sort((a, b) => a.usage - b.usage || a.priority - b.priority)[0];
  }

  if (strategy === "roundRobin") {
    return [...available].sort((a, b) => a.usage - b.usage || a.id.localeCompare(b.id))[0];
  }

  return [...available].sort((a, b) => a.priority - b.priority || a.usage - b.usage)[0];
}

export function getStrategyLabel(strategy: RoutingStrategy) {
  const labels: Record<RoutingStrategy, string> = {
    priority: "优先级优先",
    roundRobin: "循环轮询",
    leastUsed: "最少负载",
  };

  return labels[strategy];
}
