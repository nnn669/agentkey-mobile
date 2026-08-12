import { describe, expect, it } from "vitest";

import { cooldownUntilAfter, getStrategyLabel, isCooldownActive, remainingCooldownSeconds, selectKey, shouldAutoCooldown, type KeyCandidate } from "../lib/agent-logic";

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

  it("会排除仍处于自动冷却期的健康密钥", () => {
    const candidates = [
      { id: "cooled-primary", priority: 1, usage: 0, status: "healthy" as const, cooldownUntil: cooldownUntilAfter(60) },
      { id: "active-backup", priority: 2, usage: 0, status: "healthy" as const },
    ];
    expect(selectKey(candidates, "priority")?.id).toBe("active-backup");
  });
});

describe("密钥自动冷却", () => {
  it("计算冷却中的状态和向上取整的剩余秒数", () => {
    const now = Date.parse("2026-08-12T00:00:00.000Z");
    const until = cooldownUntilAfter(46, now);
    expect(isCooldownActive(until, now)).toBe(true);
    expect(remainingCooldownSeconds(until, now + 500)).toBe(46);
    expect(isCooldownActive(until, now + 46_000)).toBe(false);
  });

  it("在达到连续失败阈值或配额时触发自动冷却", () => {
    expect(shouldAutoCooldown({ failureCount: 2, failureThreshold: 2, usage: 10, quota: 100 })).toBe(true);
    expect(shouldAutoCooldown({ failureCount: 0, failureThreshold: 2, usage: 100, quota: 100 })).toBe(true);
    expect(shouldAutoCooldown({ failureCount: 1, failureThreshold: 2, usage: 99, quota: 100 })).toBe(false);
  });
});
