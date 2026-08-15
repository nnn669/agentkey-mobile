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

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ActualUsageRun = {
  createdAt: string;
  modelLabel: string;
  providerName?: string;
  actualTokenUsage?: TokenUsage;
};

export type TokenUsageFilters = {
  after?: number;
  modelLabel?: string;
  providerName?: string;
};

export type TokenTrendPoint = TokenUsage & {
  date: string;
  runCount: number;
};

type UsageRecord = Record<string, unknown>;

function isUsageRecord(value: unknown): value is UsageRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readUsageNumber(record: UsageRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return undefined;
}

export function parseApiTokenUsage(payload: unknown): TokenUsage | undefined {
  if (!isUsageRecord(payload)) return undefined;
  const usage = isUsageRecord(payload.usage)
    ? payload.usage
    : isUsageRecord(payload.data) && isUsageRecord(payload.data.usage)
      ? payload.data.usage
      : isUsageRecord(payload.metadata) && isUsageRecord(payload.metadata.usage)
        ? payload.metadata.usage
        : undefined;
  if (!usage) return undefined;

  const inputTokens = readUsageNumber(usage, ["prompt_tokens", "input_tokens", "promptTokens", "inputTokens"]);
  const outputTokens = readUsageNumber(usage, ["completion_tokens", "output_tokens", "completionTokens", "outputTokens"]);
  const totalTokens = readUsageNumber(usage, ["total_tokens", "totalTokens"]);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;

  return {
    inputTokens: inputTokens ?? Math.max(0, (totalTokens ?? 0) - (outputTokens ?? 0)),
    outputTokens: outputTokens ?? Math.max(0, (totalTokens ?? 0) - (inputTokens ?? 0)),
    totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
  };
}

export function estimateTextTokens(text: string) {
  const value = text.trim();
  if (!value) return 0;
  const hanCharacters = (value.match(/[\p{Script=Han}]/gu) ?? []).length;
  const wordCharacters = value.replace(/[\p{Script=Han}]/gu, "").match(/[\p{L}\p{N}_-]+/gu) ?? [];
  const wordTokens = wordCharacters.reduce((total, word) => total + Math.ceil(word.length / 4), 0);
  const punctuationTokens = Math.ceil(value.replace(/[\p{Script=Han}\p{L}\p{N}_\s-]/gu, "").length / 3);
  return hanCharacters + wordTokens + punctuationTokens;
}

export function createTokenUsage(inputText: string, outputText: string): TokenUsage {
  const inputTokens = estimateTextTokens(inputText);
  const outputTokens = estimateTextTokens(outputText);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

export function sumTokenUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce((total, usage) => ({
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
  }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
}

export function filterActualTokenRuns<T extends ActualUsageRun>(runs: T[], filters: TokenUsageFilters = {}) {
  return runs.filter((run) => {
    if (!run.actualTokenUsage) return false;
    const createdAt = Date.parse(run.createdAt);
    if (!Number.isFinite(createdAt)) return false;
    if (filters.after !== undefined && createdAt < filters.after) return false;
    if (filters.modelLabel && run.modelLabel !== filters.modelLabel) return false;
    if (filters.providerName && run.providerName !== filters.providerName) return false;
    return true;
  });
}

export function createActualTokenTrend(runs: ActualUsageRun[]): TokenTrendPoint[] {
  const points = new Map<string, TokenTrendPoint>();
  for (const run of runs) {
    if (!run.actualTokenUsage) continue;
    const time = Date.parse(run.createdAt);
    if (!Number.isFinite(time)) continue;
    const date = new Date(time).toISOString().slice(0, 10);
    const current = points.get(date) ?? { date, inputTokens: 0, outputTokens: 0, totalTokens: 0, runCount: 0 };
    points.set(date, {
      date,
      inputTokens: current.inputTokens + run.actualTokenUsage.inputTokens,
      outputTokens: current.outputTokens + run.actualTokenUsage.outputTokens,
      totalTokens: current.totalTokens + run.actualTokenUsage.totalTokens,
      runCount: current.runCount + 1,
    });
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}

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

function sortStable<T extends KeyCandidate>(keys: T[]) {
  return [...keys].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function selectRoundRobin<T extends KeyCandidate>(keys: T[], lastRoutedKeyId?: string): T | undefined {
  const available = sortStable(keys.filter((key) => key.status === "healthy" && !isCooldownActive(key.cooldownUntil)));
  if (!available.length) return undefined;
  const lastIndex = available.findIndex((key) => key.id === lastRoutedKeyId);
  return available[(lastIndex + 1 + available.length) % available.length];
}

export function selectKey<T extends KeyCandidate>(keys: T[], strategy: RoutingStrategy, lastRoutedKeyId?: string): T | undefined {
  const available = keys.filter((key) => key.status === "healthy" && !isCooldownActive(key.cooldownUntil));

  if (!available.length) return undefined;

  if (strategy === "leastUsed") {
    return [...available].sort((a, b) => a.usage - b.usage || a.priority - b.priority)[0];
  }

  if (strategy === "roundRobin") {
    return selectRoundRobin(available, lastRoutedKeyId);
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
