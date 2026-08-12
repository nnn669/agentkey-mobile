export type RoutingStrategy = "priority" | "roundRobin" | "leastUsed";
export type KeyStatus = "healthy" | "cooling" | "disabled";

export type KeyCandidate = {
  id: string;
  priority: number;
  usage: number;
  status: KeyStatus;
  cooldownUntil?: string;
};

export type CooldownReason = "manual" | "认证失败" | "请求限流" | "连续失败" | "配额触达";

export function isCooldownActive(cooldownUntil?: string, now = Date.now()) {
  return Boolean(cooldownUntil && Date.parse(cooldownUntil) > now);
}

export function remainingCooldownSeconds(cooldownUntil?: string, now = Date.now()) {
  if (!cooldownUntil) return 0;
  return Math.max(0, Math.ceil((Date.parse(cooldownUntil) - now) / 1000));
}

export function cooldownUntilAfter(seconds: number, now = Date.now()) {
  return new Date(now + seconds * 1000).toISOString();
}

export function shouldAutoCooldown({ failureCount, failureThreshold, usage, quota }: { failureCount: number; failureThreshold: number; usage: number; quota: number }) {
  return failureCount >= failureThreshold || usage >= quota;
}

export function selectKey<T extends KeyCandidate>(keys: T[], strategy: RoutingStrategy): T | undefined {
  const available = keys.filter((key) => key.status === "healthy" && !isCooldownActive(key.cooldownUntil));

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
