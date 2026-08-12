import { describe, expect, it } from "vitest";

import { getStrategyLabel, selectKey, type KeyCandidate } from "../lib/agent-logic";

const pool: KeyCandidate[] = [
  { id: "primary", priority: 1, usage: 18, status: "healthy" },
  { id: "backup", priority: 2, usage: 3, status: "healthy" },
  { id: "cooling", priority: 3, usage: 0, status: "cooling" },
];

describe("多密钥路由", () => {
  it("优先级模式选择优先级最高的可用密钥", () => {
    expect(selectKey(pool, "priority")?.id).toBe("primary");
  });

  it("循环轮询模式优先选择当前用量较低的可用密钥", () => {
    expect(selectKey(pool, "roundRobin")?.id).toBe("backup");
  });

  it("最少负载模式忽略冷却中的密钥", () => {
    expect(selectKey(pool, "leastUsed")?.id).toBe("backup");
  });

  it("没有可用密钥时不返回候选项", () => {
    const unavailable = pool.map((key) => ({ ...key, status: "disabled" as const }));
    expect(selectKey(unavailable, "priority")).toBeUndefined();
  });

  it("为每个策略提供清晰的中文标签", () => {
    expect(getStrategyLabel("priority")).toBe("优先级优先");
    expect(getStrategyLabel("roundRobin")).toBe("循环轮询");
    expect(getStrategyLabel("leastUsed")).toBe("最少负载");
  });
});
