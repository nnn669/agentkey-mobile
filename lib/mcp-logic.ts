export type McpTransport = "http" | "sse";

export type McpToolDescriptor = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpRpcEnvelope = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

export function createRpcRequest(id: number, method: string, params?: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    ...(params ? { params } : {}),
  };
}

export function parseMcpEnvelope(raw: string): McpRpcEnvelope {
  const candidates = [raw, ...raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.replace(/^data:\s?/, ""))];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as McpRpcEnvelope;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try the next SSE event payload.
    }
  }
  throw new Error("MCP 服务返回了无法解析的 JSON-RPC 响应。");
}

export function extractMcpTools(envelope: McpRpcEnvelope): McpToolDescriptor[] {
  if (envelope.error) throw new Error(envelope.error.message || "MCP 服务返回未知错误。");
  const result = envelope.result as { tools?: unknown } | undefined;
  if (!Array.isArray(result?.tools)) return [];
  return result.tools
    .filter((tool): tool is { name: string; description?: string; inputSchema?: Record<string, unknown> } => Boolean(tool && typeof tool === "object" && "name" in tool && typeof tool.name === "string"))
    .map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
}

export function getSseMessageEndpoint(raw: string): string | undefined {
  const endpointLine = raw.split(/\r?\n/).find((line) => line.startsWith("data:") && /https?:\/\//.test(line));
  return endpointLine?.replace(/^data:\s?/, "").trim();
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  const value = raw.trim();
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("工具参数必须是 JSON 对象。");
  return parsed as Record<string, unknown>;
}

const SENSITIVE_FIELD = /token|secret|password|authorization|api[_-]?key|credential/i;

export type MemoryBackupItem = {
  title: string;
  content: string;
  category: string;
  enabled: boolean;
};

export type MemoryBackup = {
  schema: "agentkey.memory.v1";
  exportedAt: string;
  entries: MemoryBackupItem[];
};

function redactText(value: string) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[已脱敏密钥]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}\b/gi, "Bearer [已脱敏]")
    .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[已脱敏]");
}

function summarizeValue(value: unknown) {
  if (typeof value === "string") return value.length > 64 ? `“${value.slice(0, 61)}…”` : `“${value}”`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `数组(${value.length})`;
  if (value && typeof value === "object") return `对象(${Object.keys(value).length})`;
  return "null";
}

export function summarizeToolArguments(raw: string) {
  const values = parseToolArguments(raw);
  const items = Object.entries(values).map(([key, value]) => `${key}: ${SENSITIVE_FIELD.test(key) ? "[已脱敏]" : summarizeValue(value)}`);
  return items.length ? items.join(" · ") : "无参数";
}

export function createMemoryBackup(entries: MemoryBackupItem[], exportedAt = new Date().toISOString()) {
  const sanitized: MemoryBackup = {
    schema: "agentkey.memory.v1",
    exportedAt,
    entries: entries
      .filter((entry) => entry.title.trim() && entry.content.trim())
      .map((entry) => ({
        title: redactText(entry.title.trim()).slice(0, 120),
        content: redactText(entry.content.trim()).slice(0, 4000),
        category: redactText(entry.category.trim() || "未分类").slice(0, 60),
        enabled: entry.enabled !== false,
      })),
  };
  return JSON.stringify(sanitized, null, 2);
}

export function parseMemoryBackup(raw: string): MemoryBackupItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("备份文件不是有效的 JSON。");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("备份内容格式不正确。");
  const backup = parsed as Partial<MemoryBackup>;
  if (backup.schema !== "agentkey.memory.v1" || !Array.isArray(backup.entries)) throw new Error("无法识别的 AgentKey 记忆备份格式。");
  if (backup.entries.length > 200) throw new Error("单次最多导入 200 条记忆。");
  const entries = backup.entries.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("备份中包含无效记忆项。");
    const item = entry as Partial<MemoryBackupItem>;
    if (typeof item.title !== "string" || typeof item.content !== "string" || !item.title.trim() || !item.content.trim()) throw new Error("每条记忆都需要标题和内容。");
    return {
      title: item.title.trim().slice(0, 120),
      content: item.content.trim().slice(0, 4000),
      category: typeof item.category === "string" && item.category.trim() ? item.category.trim().slice(0, 60) : "未分类",
      enabled: item.enabled !== false,
    };
  });
  return entries;
}

export function rankMemories<T extends { title: string; content: string; enabled: boolean }>(memories: T[], prompt: string, limit = 3) {
  const tokens = prompt.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((token) => token.length > 1);
  return memories
    .filter((memory) => memory.enabled)
    .map((memory) => ({ memory, score: tokens.reduce((score, token) => score + (memory.title.toLocaleLowerCase().includes(token) ? 3 : 0) + (memory.content.toLocaleLowerCase().includes(token) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.memory.title.localeCompare(b.memory.title))
    .slice(0, limit)
    .map((item) => item.memory);
}
