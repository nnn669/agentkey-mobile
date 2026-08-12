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
