import { describe, expect, it } from "vitest";

import { cooldownUntilAfter, createTokenUsage, estimateTextTokens, getStrategyLabel, isCooldownActive, remainingCooldownSeconds, selectKey, shouldAutoCooldown, sumTokenUsage, type KeyCandidate } from "../lib/agent-logic";
import { createMemoryBackup, createRpcRequest, extractMcpTools, isAuthGrantValid, isHighRiskTool, parseMcpEnvelope, parseMemoryBackup, parseToolArguments, rankMemories, summarizeToolArguments } from "../lib/mcp-logic";

const pool: KeyCandidate[] = [
  { id: "primary", priority: 1, usage: 18, status: "healthy" },
  { id: "backup", priority: 2, usage: 3, status: "healthy" },
  { id: "cooling", priority: 3, usage: 0, status: "cooling" },
];

describe("多密钥路由", () => {
  it("优先级模式选择优先级最高的可用密钥", () => {
    expect(selectKey(pool, "priority")?.id).toBe("primary");
  });

  it("循环轮询在没有游标时从稳定顺序的第一把可用密钥开始", () => {
    expect(selectKey(pool, "roundRobin")?.id).toBe("primary");
  });

  it("循环轮询从模型游标的下一把密钥继续，并在末尾回绕", () => {
    expect(selectKey(pool, "roundRobin", "primary")?.id).toBe("backup");
    expect(selectKey(pool, "roundRobin", "backup")?.id).toBe("primary");
  });

  it("循环轮询跳过冷却和停用的密钥", () => {
    const candidates: KeyCandidate[] = [
      { id: "first", priority: 1, usage: 0, status: "healthy" },
      { id: "skipped", priority: 2, usage: 0, status: "disabled" },
      { id: "third", priority: 3, usage: 0, status: "healthy" },
    ];
    expect(selectKey(candidates, "roundRobin", "first")?.id).toBe("third");
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

describe("Token 统计", () => {
  it("以确定性规则估算中英文输入文本的 Token 数", () => {
    expect(estimateTextTokens("你好")).toBe(2);
    expect(estimateTextTokens("hello")).toBe(2);
    expect(estimateTextTokens("   ")).toBe(0);
  });

  it("区分输入、输出并汇总多个任务的 Token 使用量", () => {
    const first = createTokenUsage("你好", "hello");
    const second = createTokenUsage("分析", "完成");
    expect(first).toEqual({ inputTokens: 2, outputTokens: 2, totalTokens: 4 });
    expect(sumTokenUsage([first, second])).toEqual({ inputTokens: 4, outputTokens: 4, totalTokens: 8 });
  });
});

describe("MCP 工具与本地记忆", () => {
  it("创建兼容 JSON-RPC 的 MCP 请求", () => {
    expect(createRpcRequest(8, "tools/list")).toEqual({ jsonrpc: "2.0", id: 8, method: "tools/list" });
    expect(createRpcRequest(9, "tools/call", { name: "search" }).params).toEqual({ name: "search" });
  });

  it("从 HTTP 或 SSE 数据行中解析 MCP 响应并发现工具", () => {
    const parsed = parseMcpEnvelope("event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":8,\"result\":{\"tools\":[{\"name\":\"search_docs\",\"description\":\"检索文档\"}]}}\n\n");
    expect(extractMcpTools(parsed)).toEqual([{ name: "search_docs", description: "检索文档", inputSchema: undefined }]);
  });

  it("拒绝无法解析的响应及非对象工具参数", () => {
    expect(() => parseMcpEnvelope("not-json")).toThrow("无法解析");
    expect(() => parseToolArguments("[]")).toThrow("JSON 对象");
    expect(parseToolArguments("")).toEqual({});
  });

  it("仅检索已启用且与任务匹配的本地记忆", () => {
    const memories = [
      { title: "安全偏好", content: "API 密钥需要脱敏", enabled: true },
      { title: "项目计划", content: "使用 MCP 工具检索文档", enabled: true },
      { title: "隐藏信息", content: "MCP 密钥", enabled: false },
    ];
    expect(rankMemories(memories, "请用 MCP 检索项目文档").map((memory) => memory.title)).toEqual(["项目计划"]);
  });

  it("在授权前生成工具参数摘要，并脱敏敏感字段", () => {
    expect(summarizeToolArguments('{"query":"季度报告","apiKey":"sk-should-hide","limit":5}')).toBe("query: “季度报告” · apiKey: [已脱敏] · limit: 5");
    expect(summarizeToolArguments("{}")).toBe("无参数");
  });

  it("识别具备写入、删除或发布能力的高风险工具", () => {
    expect(isHighRiskTool({ name: "delete_record", description: "永久删除一条记录" })).toBe(true);
    expect(isHighRiskTool({ name: "deploy_service", description: "发布到生产环境" })).toBe(true);
    expect(isHighRiskTool({ name: "search_docs", description: "检索只读文档" })).toBe(false);
  });

  it("仅接受未到期或永久的记住授权，并拒绝一次性及过期记录", () => {
    const now = Date.parse("2026-08-13T00:00:00.000Z");
    expect(isAuthGrantValid({ toolId: "server:write", grantedAt: "2026-08-12T23:30:00.000Z", expiresAt: "2026-08-13T01:00:00.000Z", scope: "1h" }, now)).toBe(true);
    expect(isAuthGrantValid({ toolId: "server:write", grantedAt: "2026-08-12T22:00:00.000Z", expiresAt: "2026-08-12T23:00:00.000Z", scope: "1h" }, now)).toBe(false);
    expect(isAuthGrantValid({ toolId: "server:write", grantedAt: "2026-08-12T00:00:00.000Z", scope: "permanent" }, now)).toBe(true);
    expect(isAuthGrantValid({ toolId: "server:write", grantedAt: "2026-08-13T00:00:00.000Z", scope: "once" }, now)).toBe(false);
  });

  it("导出脱敏记忆备份且不携带运行时标识", () => {
    const backup = JSON.parse(createMemoryBackup([{ title: "访问令牌", content: "token=top-secret-value", category: "安全", enabled: true }], "2026-08-12T00:00:00.000Z"));
    expect(backup).toEqual({ schema: "agentkey.memory.v1", exportedAt: "2026-08-12T00:00:00.000Z", entries: [{ title: "访问令牌", content: "token=[已脱敏]", category: "安全", enabled: true }] });
    expect(backup.entries[0]).not.toHaveProperty("id");
  });

  it("校验记忆备份格式并拒绝不受支持的数据", () => {
    expect(parseMemoryBackup('{"schema":"agentkey.memory.v1","entries":[{"title":"偏好","content":"保持脱敏","category":"安全","enabled":true}]}')).toEqual([{ title: "偏好", content: "保持脱敏", category: "安全", enabled: true }]);
    expect(() => parseMemoryBackup('{"schema":"unknown","entries":[]}')).toThrow("无法识别");
    expect(() => parseMemoryBackup(JSON.stringify({ schema: "agentkey.memory.v1", entries: Array.from({ length: 201 }, () => ({ title: "x", content: "y" })) }))).toThrow("最多导入 200");
  });
});
