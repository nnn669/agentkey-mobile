import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { cooldownUntilAfter, createTokenUsage, getStrategyLabel, isCooldownActive, parseApiTokenUsage, selectKey, shouldAutoCooldown, type CooldownReason, type KeyStatus, type RoutingStrategy, type TokenUsage } from "@/lib/agent-logic";
import { createMemoryBackup, createRpcRequest, extractMcpTools, isAuthGrantValid, isHighRiskTool, parseMcpEnvelope, parseMemoryBackup, parseToolArguments, rankMemories, type McpToolDescriptor, type McpTransport, type ToolAuthGrant, type ToolAuthScope } from "@/lib/mcp-logic";
import { createSandboxWorkspace, deriveSandboxCommandProposal, executeSandboxCommand, isSandboxCommandAllowed, isSandboxCommandAutoApprovable, type SandboxWorkspace } from "@/lib/sandbox-shell";

export type { ToolAuthGrant, ToolAuthScope } from "@/lib/mcp-logic";

const STORAGE_KEY = "agentkey.public-config.v1";
const SECRET_PREFIX = "agentkey.secret.";

export type ModelProfile = {
  id: string;
  providerId: string;
  modelId: string;
  label: string;
  enabled: boolean;
  routingStrategy?: RoutingStrategy;
  lastRoutedKeyId?: string;
};

export type ApiProvider = {
  id: string;
  name: string;
  baseUrl: string;
  protocol: "OpenAI 兼容" | "自定义 REST";
  enabled: boolean;
  models: ModelProfile[];
  diagnostic?: ProviderDiagnostic;
};

export type ConnectionTestMode = "simulated" | "direct";

export type ProviderDiagnostic = {
  state: "idle" | "testing" | "healthy" | "error";
  mode: ConnectionTestMode;
  message: string;
  checkedAt?: string;
  latencyMs?: number;
  statusCode?: number;
};

export type KeyEntry = {
  id: string;
  modelProfileId: string;
  label: string;
  suffix: string;
  priority: number;
  quota: number;
  usage: number;
  status: KeyStatus;
  lastError?: string;
  failureCount?: number;
  cooldownUntil?: string;
  cooldownReason?: CooldownReason;
  lastUsedAt?: string;
};

export type RoutingRule = {
  defaultModelId: string;
  strategy: RoutingStrategy;
  failureThreshold: number;
  cooldownSeconds: number;
};

export type RunStep = {
  id: string;
  title: string;
  detail: string;
  state: "complete" | "warning" | "running";
};

export type AgentRun = {
  id: string;
  prompt: string;
  status: "running" | "completed";
  modelLabel: string;
  keySuffix: string;
  usedFallback: boolean;
  createdAt: string;
  modelId?: string;
  providerName?: string;
  steps: RunStep[];
  tokenUsage?: TokenUsage;
  actualTokenUsage?: TokenUsage;
};

export type McpDiagnostic = {
  state: "idle" | "testing" | "healthy" | "error";
  message: string;
  checkedAt?: string;
  latencyMs?: number;
  statusCode?: number;
};

export type McpServer = {
  id: string;
  name: string;
  transport: McpTransport;
  endpoint: string;
  messageEndpoint?: string;
  authSuffix?: string;
  enabled: boolean;
  diagnostic?: McpDiagnostic;
};

export type McpTool = McpToolDescriptor & {
  id: string;
  serverId: string;
  enabled: boolean;
  lastStatus?: "idle" | "running" | "success" | "error";
  lastSummary?: string;
};

export type MemoryEntry = {
  id: string;
  title: string;
  content: string;
  category: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MemoryImportMode = "merge" | "replace";

export type McpCall = {
  id: string;
  serverId: string;
  toolName: string;
  status: "running" | "success" | "error";
  summary: string;
  createdAt: string;
};

export type SandboxCommand = {
  id: string;
  command: string;
  reason: string;
  requestedBy: "model";
  status: "pending" | "completed" | "rejected" | "blocked";
  createdAt: string;
  runId?: string;
  output?: string;
  exitCode?: number;
  approval?: "manual" | "automatic";
};

type PersistedState = {
  providers: ApiProvider[];
  keys: KeyEntry[];
  rule: RoutingRule;
  runs: AgentRun[];
  mcpServers: McpServer[];
  mcpTools: McpTool[];
  memories: MemoryEntry[];
  mcpCalls: McpCall[];
  toolAuthGrants: ToolAuthGrant[];
  sandboxWorkspace: SandboxWorkspace;
  sandboxCommands: SandboxCommand[];
  sandboxAutoApproveLowRisk: boolean;
};

const seedProviders: ApiProvider[] = [
  {
    id: "provider-local-gateway",
    name: "My AI Gateway",
    baseUrl: "https://gateway.example.com/v1",
    protocol: "OpenAI 兼容",
    enabled: true,
    models: [
      {
        id: "model-reasoning-v1",
        providerId: "provider-local-gateway",
        modelId: "reasoning-v1",
        label: "Reasoning V1",
        enabled: true,
      },
    ],
  },
];

const seedKeys: KeyEntry[] = [
  {
    id: "key-primary",
    modelProfileId: "model-reasoning-v1",
    label: "主密钥",
    suffix: "K8M2",
    priority: 1,
    quota: 1000,
    usage: 186,
    status: "healthy",
  },
  {
    id: "key-backup",
    modelProfileId: "model-reasoning-v1",
    label: "备用密钥",
    suffix: "Q7L9",
    priority: 2,
    quota: 1000,
    usage: 102,
    status: "healthy",
  },
  {
    id: "key-cooling",
    modelProfileId: "model-reasoning-v1",
    label: "冷却密钥",
    suffix: "H4X6",
    priority: 3,
    quota: 600,
    usage: 600,
    status: "cooling",
    lastError: "达到演示配额阈值",
    cooldownReason: "配额触达",
    cooldownUntil: cooldownUntilAfter(45),
  },
];

const seedRule: RoutingRule = {
  defaultModelId: "model-reasoning-v1",
  strategy: "priority",
  failureThreshold: 2,
  cooldownSeconds: 45,
};

const seedMemories: MemoryEntry[] = [
  {
    id: "memory-agentkey-privacy",
    title: "敏感信息处理偏好",
    content: "在执行代理任务时，优先展示脱敏标识与执行摘要，不将密钥、认证令牌或完整请求体写入轨迹。",
    category: "安全",
    enabled: true,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
  },
];

type AgentStateValue = {
  hydrated: boolean;
  providers: ApiProvider[];
  keys: KeyEntry[];
  rule: RoutingRule;
  runs: AgentRun[];
  models: ModelProfile[];
  defaultModel?: ModelProfile;
  addProvider: (name: string, baseUrl: string, modelLabel: string) => void;
  addModel: (providerId: string, modelLabel: string) => void;
  removeModel: (modelId: string) => Promise<void>;
  updateModelRouting: (modelId: string, strategy: RoutingStrategy) => void;
  toggleProvider: (providerId: string) => void;
  removeProvider: (providerId: string) => void;
  addKey: (modelProfileId: string, label: string, secret: string) => Promise<boolean>;
  removeKey: (keyId: string) => Promise<void>;
  cycleKeyStatus: (keyId: string) => void;
  updateRule: (patch: Partial<RoutingRule>) => void;
  runAgent: (prompt: string) => void;
  clearRuns: () => void;
  testProvider: (providerId: string, mode: ConnectionTestMode, modelId?: string) => Promise<void>;
  mcpServers: McpServer[];
  mcpTools: McpTool[];
  memories: MemoryEntry[];
  mcpCalls: McpCall[];
  toolAuthGrants: ToolAuthGrant[];
  sandboxWorkspace: SandboxWorkspace;
  sandboxCommands: SandboxCommand[];
  sandboxAutoApproveLowRisk: boolean;
  addMcpServer: (input: { name: string; transport: McpTransport; endpoint: string; messageEndpoint?: string; authToken?: string }) => Promise<boolean>;
  removeMcpServer: (serverId: string) => Promise<void>;
  testMcpServer: (serverId: string) => Promise<void>;
  toggleMcpTool: (toolId: string) => void;
  checkToolAuth: (toolId: string) => ToolAuthGrant | null;
  grantToolAuth: (toolId: string, scope: ToolAuthScope) => void;
  revokeToolAuth: (toolId: string) => void;
  callMcpTool: (toolId: string, rawArguments: string, options?: { authorizationConfirmed?: boolean }) => Promise<"called" | "authorization_required" | "unavailable">;
  requestSandboxCommand: (command: string, reason: string, runId?: string) => string | undefined;
  approveSandboxCommand: (commandId: string) => void;
  rejectSandboxCommand: (commandId: string) => void;
  setSandboxAutoApproveLowRisk: (enabled: boolean) => void;
  addMemory: (input: { title: string; content: string; category: string }) => void;
  updateMemory: (memoryId: string, patch: Partial<Pick<MemoryEntry, "title" | "content" | "category" | "enabled">>) => void;
  removeMemory: (memoryId: string) => void;
  exportMemories: () => string;
  importMemories: (raw: string, mode: MemoryImportMode) => number;
};

const AgentStateContext = createContext<AgentStateValue | undefined>(undefined);

function secretStorageKey(keyId: string) {
  return `${SECRET_PREFIX}${keyId}`;
}

async function storeSecret(keyId: string, secret: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(secretStorageKey(keyId), secret);
    return;
  }

  await SecureStore.setItemAsync(secretStorageKey(keyId), secret, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function readSecret(keyId: string) {
  if (Platform.OS === "web") return AsyncStorage.getItem(secretStorageKey(keyId));
  return SecureStore.getItemAsync(secretStorageKey(keyId));
}

async function deleteSecret(keyId: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(secretStorageKey(keyId));
    return;
  }
  await SecureStore.deleteItemAsync(secretStorageKey(keyId));
}

function getCompletionEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function getResponsePreview(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "服务端已完成响应";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "服务端已完成响应";
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
  return typeof content === "string" && content.trim() ? content.trim().replace(/\s+/g, " ").slice(0, 72) : "服务端已完成响应";
}

export function AgentStateProvider({ children }: PropsWithChildren) {
  const [providers, setProviders] = useState<ApiProvider[]>(seedProviders);
  const [keys, setKeys] = useState<KeyEntry[]>(seedKeys);
  const [rule, setRule] = useState<RoutingRule>(seedRule);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [memories, setMemories] = useState<MemoryEntry[]>(seedMemories);
  const [mcpCalls, setMcpCalls] = useState<McpCall[]>([]);
  const [toolAuthGrants, setToolAuthGrants] = useState<ToolAuthGrant[]>([]);
  const [sandboxWorkspace] = useState<SandboxWorkspace>(createSandboxWorkspace);
  const [sandboxCommands, setSandboxCommands] = useState<SandboxCommand[]>([]);
  const [sandboxAutoApproveLowRisk, setSandboxAutoApproveLowRisk] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loadState = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const parsed = JSON.parse(stored) as Partial<PersistedState>;
        if (parsed.providers?.length) setProviders(parsed.providers);
        if (parsed.keys?.length) setKeys(parsed.keys);
        if (parsed.rule) setRule(parsed.rule);
        if (parsed.runs) setRuns(parsed.runs);
        if (parsed.mcpServers) setMcpServers(parsed.mcpServers);
        if (parsed.mcpTools) setMcpTools(parsed.mcpTools);
        if (parsed.memories) setMemories(parsed.memories);
        if (parsed.mcpCalls) setMcpCalls(parsed.mcpCalls);
        if (parsed.toolAuthGrants) setToolAuthGrants(parsed.toolAuthGrants.filter((grant): grant is ToolAuthGrant => Boolean(grant && typeof grant.toolId === "string" && typeof grant.grantedAt === "string" && typeof grant.scope === "string" && isAuthGrantValid(grant as ToolAuthGrant))));
        if (parsed.sandboxCommands) setSandboxCommands(parsed.sandboxCommands.filter((command): command is SandboxCommand => Boolean(command && typeof command.id === "string" && typeof command.command === "string" && typeof command.status === "string")));
        if (typeof parsed.sandboxAutoApproveLowRisk === "boolean") setSandboxAutoApproveLowRisk(parsed.sandboxAutoApproveLowRisk);
      } finally {
        setHydrated(true);
      }
    };

    void loadState();
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const payload: PersistedState = { providers, keys, rule, runs, mcpServers, mcpTools, memories, mcpCalls, toolAuthGrants, sandboxWorkspace, sandboxCommands, sandboxAutoApproveLowRisk };
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [hydrated, keys, mcpCalls, mcpServers, mcpTools, memories, providers, rule, runs, sandboxAutoApproveLowRisk, sandboxCommands, sandboxWorkspace, toolAuthGrants]);

  useEffect(() => {
    const restoreExpiredKeys = () => {
      const now = Date.now();
      setKeys((current) => current.map((key) => key.status === "cooling" && key.cooldownUntil && !isCooldownActive(key.cooldownUntil, now)
        ? { ...key, status: "healthy", cooldownUntil: undefined, cooldownReason: undefined, failureCount: 0, lastError: undefined }
        : key));
    };
    restoreExpiredKeys();
    const timer = setInterval(restoreExpiredKeys, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const removeExpiredToolAuth = () => {
      setToolAuthGrants((current) => current.filter((grant) => isAuthGrantValid(grant)));
    };
    removeExpiredToolAuth();
    const timer = setInterval(removeExpiredToolAuth, 60_000);
    return () => clearInterval(timer);
  }, []);

  const models = useMemo(() => providers.flatMap((provider) => provider.models), [providers]);
  const defaultModel = useMemo(
    () => models.find((model) => model.id === rule.defaultModelId) ?? models[0],
    [models, rule.defaultModelId],
  );

  const addProvider = useCallback((name: string, baseUrl: string, modelLabel: string) => {
    const providerId = `provider-${Date.now()}`;
    const modelId = `model-${Date.now()}`;
    const newProvider: ApiProvider = {
      id: providerId,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      protocol: "OpenAI 兼容",
      enabled: true,
      models: [
        {
          id: modelId,
          providerId,
          modelId: modelLabel.trim().toLowerCase().replace(/\s+/g, "-"),
          label: modelLabel.trim(),
          enabled: true,
        },
      ],
    };
    setProviders((current) => [...current, newProvider]);
    setRule((current) => (current.defaultModelId ? current : { ...current, defaultModelId: modelId }));
  }, []);

  const addModel = useCallback((providerId: string, modelLabel: string) => {
    const trimmedLabel = modelLabel.trim();
    if (!trimmedLabel) return;
    const modelId = `model-${Date.now()}`;
    const newModel: ModelProfile = {
      id: modelId,
      providerId,
      modelId: trimmedLabel.toLowerCase().replace(/\s+/g, "-"),
      label: trimmedLabel,
      enabled: true,
      routingStrategy: "roundRobin",
    };
    setProviders((current) => current.map((provider) => provider.id === providerId ? { ...provider, models: [...provider.models, newModel] } : provider));
  }, []);

  const removeModel = useCallback(async (modelId: string) => {
    const relatedKeyIds = keys.filter((key) => key.modelProfileId === modelId).map((key) => key.id);
    await Promise.all(relatedKeyIds.map(deleteSecret));
    setKeys((current) => current.filter((key) => key.modelProfileId !== modelId));
    setProviders((current) => current.map((provider) => ({ ...provider, models: provider.models.filter((model) => model.id !== modelId) })));
    setRule((current) => current.defaultModelId === modelId ? { ...current, defaultModelId: "" } : current);
  }, [keys]);

  const updateModelRouting = useCallback((modelId: string, strategy: RoutingStrategy) => {
    setProviders((current) => current.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => model.id === modelId ? { ...model, routingStrategy: strategy, lastRoutedKeyId: undefined } : model),
    })));
  }, []);

  const toggleProvider = useCallback((providerId: string) => {
    setProviders((current) =>
      current.map((provider) =>
        provider.id === providerId ? { ...provider, enabled: !provider.enabled } : provider,
      ),
    );
  }, []);

  const removeProvider = useCallback((providerId: string) => {
    const relatedKeyIds = keys.filter((key) => providers.find((provider) => provider.id === providerId)?.models.some((model) => model.id === key.modelProfileId)).map((key) => key.id);
    void Promise.all(relatedKeyIds.map(deleteSecret));
    setProviders((current) => current.filter((provider) => provider.id !== providerId));
    setKeys((current) => current.filter((key) => !providers.find((provider) => provider.id === providerId)?.models.some((model) => model.id === key.modelProfileId)));
  }, [keys, providers]);

  const addKey = useCallback(async (modelProfileId: string, label: string, secret: string) => {
    const normalizedSecret = secret.trim();
    if (!normalizedSecret) return false;

    const id = `key-${Date.now()}`;
    await storeSecret(id, normalizedSecret);
    setKeys((current) => [
      ...current,
      {
        id,
        modelProfileId,
        label: label.trim() || "未命名密钥",
        suffix: normalizedSecret.slice(-4).toUpperCase(),
        priority: current.filter((key) => key.modelProfileId === modelProfileId).length + 1,
        quota: 1000,
        usage: 0,
        status: "healthy",
      },
    ]);
    return true;
  }, []);

  const removeKey = useCallback(async (keyId: string) => {
    await deleteSecret(keyId);
    setKeys((current) => current.filter((key) => key.id !== keyId));
    setProviders((current) => current.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => model.lastRoutedKeyId === keyId ? { ...model, lastRoutedKeyId: undefined } : model),
    })));
  }, []);

  const cycleKeyStatus = useCallback((keyId: string) => {
    const next: Record<KeyStatus, KeyStatus> = {
      healthy: "cooling",
      cooling: "disabled",
      disabled: "healthy",
    };
    setKeys((current) => current.map((key) => (key.id === keyId ? { ...key, status: next[key.status], cooldownUntil: undefined, cooldownReason: undefined } : key)));
  }, []);

  const updateRule = useCallback((patch: Partial<RoutingRule>) => {
    setRule((current) => ({ ...current, ...patch }));
  }, []);

  const addMcpServer = useCallback(async (input: { name: string; transport: McpTransport; endpoint: string; messageEndpoint?: string; authToken?: string }) => {
    const name = input.name.trim();
    const endpoint = input.endpoint.trim();
    const messageEndpoint = input.messageEndpoint?.trim();
    if (!name || !endpoint || (input.transport === "sse" && !messageEndpoint)) return false;

    const id = `mcp-${Date.now()}`;
    const authToken = input.authToken?.trim();
    if (authToken) await storeSecret(`mcp-${id}`, authToken);
    setMcpServers((current) => [
      ...current,
      {
        id,
        name,
        transport: input.transport,
        endpoint,
        messageEndpoint: input.transport === "sse" ? messageEndpoint : undefined,
        authSuffix: authToken ? authToken.slice(-4).toUpperCase() : undefined,
        enabled: true,
        diagnostic: { state: "idle", message: "尚未连接" },
      },
    ]);
    return true;
  }, []);

  const removeMcpServer = useCallback(async (serverId: string) => {
    await deleteSecret(`mcp-${serverId}`);
    setMcpServers((current) => current.filter((server) => server.id !== serverId));
    setMcpTools((current) => current.filter((tool) => tool.serverId !== serverId));
    setMcpCalls((current) => current.filter((call) => call.serverId !== serverId));
    setToolAuthGrants((current) => current.filter((grant) => !grant.toolId.startsWith(`${serverId}:`)));
  }, []);

  const requestMcp = useCallback(async (server: McpServer, method: string, params?: Record<string, unknown>) => {
    const endpoint = server.transport === "sse" ? server.messageEndpoint : server.endpoint;
    if (!endpoint) throw new Error("SSE 服务需要提供消息端点才能发送 JSON-RPC 请求。");
    const token = await readSecret(`mcp-${server.id}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(createRpcRequest(Date.now(), method, params)),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`MCP 服务返回 HTTP ${response.status}${text ? `：${text.slice(0, 120)}` : ""}`);
      return { envelope: parseMcpEnvelope(text), statusCode: response.status };
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const testMcpServer = useCallback(async (serverId: string) => {
    const server = mcpServers.find((item) => item.id === serverId);
    if (!server) return;
    const startedAt = Date.now();
    const checkedAt = new Date().toISOString();
    const updateDiagnostic = (diagnostic: McpDiagnostic) => setMcpServers((current) => current.map((item) => item.id === serverId ? { ...item, diagnostic } : item));
    updateDiagnostic({ state: "testing", message: `正在发现 ${server.transport.toUpperCase()} MCP 工具…` });
    try {
      if (server.transport === "sse") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4_000);
        const token = await readSecret(`mcp-${server.id}`);
        try {
          const streamResponse = await fetch(server.endpoint, { headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: controller.signal });
          if (!streamResponse.ok) throw new Error(`SSE 事件流返回 HTTP ${streamResponse.status}`);
        } finally {
          clearTimeout(timeout);
        }
      }
      const { envelope, statusCode } = await requestMcp(server, "tools/list");
      const discovered = extractMcpTools(envelope);
      setMcpTools((current) => [
        ...current.filter((tool) => tool.serverId !== serverId),
        ...discovered.map((tool) => ({ id: `${serverId}:${tool.name}`, serverId, ...tool, enabled: true, lastStatus: "idle" as const })),
      ]);
      updateDiagnostic({ state: "healthy", message: `连接成功，已发现 ${discovered.length} 个工具`, checkedAt, latencyMs: Date.now() - startedAt, statusCode });
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法连接 MCP 服务。";
      updateDiagnostic({ state: "error", message: message.slice(0, 180), checkedAt });
    }
  }, [mcpServers, requestMcp]);

  const toggleMcpTool = useCallback((toolId: string) => {
    setMcpTools((current) => current.map((tool) => tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool));
  }, []);

  const checkToolAuth = useCallback((toolId: string) => {
    const grant = toolAuthGrants.find((item) => item.toolId === toolId);
    if (!grant) return null;
    if (isAuthGrantValid(grant)) return grant;
    setToolAuthGrants((current) => current.filter((item) => item.toolId !== toolId));
    return null;
  }, [toolAuthGrants]);

  const grantToolAuth = useCallback((toolId: string, scope: ToolAuthScope) => {
    if (scope === "once") {
      setToolAuthGrants((current) => current.filter((grant) => grant.toolId !== toolId));
      return;
    }
    const grantedAt = new Date().toISOString();
    const expiresAt = scope === "1h" ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : scope === "24h" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined;
    const grant: ToolAuthGrant = { toolId, grantedAt, expiresAt, scope };
    setToolAuthGrants((current) => [...current.filter((item) => item.toolId !== toolId), grant]);
  }, []);

  const revokeToolAuth = useCallback((toolId: string) => {
    setToolAuthGrants((current) => current.filter((grant) => grant.toolId !== toolId));
  }, []);

  const callMcpTool = useCallback(async (toolId: string, rawArguments: string, options?: { authorizationConfirmed?: boolean }) => {
    const tool = mcpTools.find((item) => item.id === toolId);
    const server = tool ? mcpServers.find((item) => item.id === tool.serverId) : undefined;
    if (!tool || !server) return "unavailable" as const;
    if (isHighRiskTool(tool) && !options?.authorizationConfirmed && !checkToolAuth(toolId)) return "authorization_required" as const;
    const callId = `mcp-call-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const updateTool = (patch: Partial<McpTool>) => setMcpTools((current) => current.map((item) => item.id === toolId ? { ...item, ...patch } : item));
    setMcpCalls((current) => [{ id: callId, serverId: server.id, toolName: tool.name, status: "running" as const, summary: "正在调用…", createdAt }, ...current].slice(0, 30));
    updateTool({ lastStatus: "running", lastSummary: "正在调用…" });
    try {
      const argumentsValue = parseToolArguments(rawArguments);
      const { envelope } = await requestMcp(server, "tools/call", { name: tool.name, arguments: argumentsValue });
      if (envelope.error) throw new Error(envelope.error.message || "工具调用失败。");
      const summary = "调用完成，结果已由 MCP 服务返回。";
      updateTool({ lastStatus: "success", lastSummary: summary });
      setMcpCalls((current) => current.map((call) => call.id === callId ? { ...call, status: "success", summary } : call));
    } catch (error) {
      const summary = error instanceof Error ? error.message.slice(0, 180) : "工具调用失败。";
      updateTool({ lastStatus: "error", lastSummary: summary });
      setMcpCalls((current) => current.map((call) => call.id === callId ? { ...call, status: "error", summary } : call));
    }
    return "called" as const;
  }, [checkToolAuth, mcpServers, mcpTools, requestMcp]);

  const requestSandboxCommand = useCallback((command: string, reason: string, runId?: string) => {
    const id = `sandbox-command-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const baseCommand: Pick<SandboxCommand, "id" | "command" | "reason" | "requestedBy" | "createdAt" | "runId"> = { id, command: command.trim(), reason, requestedBy: "model", createdAt, runId };
    if (!isSandboxCommandAllowed(command)) {
      const blockedCommand: SandboxCommand = { ...baseCommand, status: "blocked", output: "命令未通过白名单与语法校验，未执行。", exitCode: 126 };
      setSandboxCommands((current) => [blockedCommand, ...current].slice(0, 60));
      return undefined;
    }
    if (sandboxAutoApproveLowRisk && isSandboxCommandAutoApprovable(command)) {
      const execution = executeSandboxCommand(command, sandboxWorkspace);
      const automaticCommand: SandboxCommand = { ...baseCommand, status: execution.ok ? "completed" : "blocked", approval: "automatic", output: execution.output.slice(0, 900), exitCode: execution.exitCode };
      setSandboxCommands((current) => [automaticCommand, ...current].slice(0, 60));
      if (runId) setRuns((current) => current.map((run) => run.id === runId ? {
        ...run,
        steps: run.steps.map((step) => step.id === "sandbox" ? { ...step, title: execution.ok ? "沙盒终端已自动执行" : "沙盒终端已拦截", detail: `$ ${command.trim()} · 低风险自动批准 · ${execution.output.replace(/\s+/g, " ").slice(0, 72)}`, state: execution.ok ? "complete" : "warning" } : step),
      } : run));
      return id;
    }
    const pendingCommand: SandboxCommand = { ...baseCommand, status: "pending" };
    setSandboxCommands((current) => [pendingCommand, ...current].slice(0, 60));
    return id;
  }, [sandboxAutoApproveLowRisk, sandboxWorkspace]);

  const approveSandboxCommand = useCallback((commandId: string) => {
    const command = sandboxCommands.find((item) => item.id === commandId && item.status === "pending");
    if (!command) return;
    const execution = executeSandboxCommand(command.command, sandboxWorkspace);
    setSandboxCommands((current) => current.map((item) => item.id === commandId ? { ...item, status: execution.ok ? "completed" : "blocked", approval: "manual", output: execution.output.slice(0, 900), exitCode: execution.exitCode } : item));
    if (command.runId) setRuns((current) => current.map((run) => run.id === command.runId ? {
      ...run,
      steps: run.steps.map((step) => step.id === "sandbox" ? { ...step, title: execution.ok ? "沙盒终端已完成" : "沙盒终端已拦截", detail: `$ ${command.command} · ${execution.output.replace(/\s+/g, " ").slice(0, 92)}`, state: execution.ok ? "complete" : "warning" } : step),
    } : run));
  }, [sandboxCommands, sandboxWorkspace]);

  const rejectSandboxCommand = useCallback((commandId: string) => {
    const command = sandboxCommands.find((item) => item.id === commandId && item.status === "pending");
    if (!command) return;
    setSandboxCommands((current) => current.map((item) => item.id === commandId ? { ...item, status: "rejected", output: "用户未授权执行此命令。", exitCode: 130 } : item));
    if (command.runId) setRuns((current) => current.map((run) => run.id === command.runId ? {
      ...run,
      steps: run.steps.map((step) => step.id === "sandbox" ? { ...step, title: "沙盒终端已拒绝", detail: `$ ${command.command} · 用户未授权`, state: "warning" } : step),
    } : run));
  }, [sandboxCommands]);

  const addMemory = useCallback((input: { title: string; content: string; category: string }) => {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title || !content) return;
    const now = new Date().toISOString();
    setMemories((current) => [{ id: `memory-${Date.now()}`, title, content, category: input.category.trim() || "未分类", enabled: true, createdAt: now, updatedAt: now }, ...current]);
  }, []);

  const updateMemory = useCallback((memoryId: string, patch: Partial<Pick<MemoryEntry, "title" | "content" | "category" | "enabled">>) => {
    setMemories((current) => current.map((memory) => memory.id === memoryId ? { ...memory, ...patch, updatedAt: new Date().toISOString() } : memory));
  }, []);

  const removeMemory = useCallback((memoryId: string) => {
    setMemories((current) => current.filter((memory) => memory.id !== memoryId));
  }, []);

  const exportMemories = useCallback(() => createMemoryBackup(memories), [memories]);

  const importMemories = useCallback((raw: string, mode: MemoryImportMode) => {
    const parsed = parseMemoryBackup(raw);
    const now = new Date().toISOString();
    const imported = parsed.map((memory, index) => ({
      ...memory,
      id: `memory-import-${Date.now()}-${index}`,
      createdAt: now,
      updatedAt: now,
    }));
    setMemories((current) => mode === "replace" ? imported : [...imported, ...current]);
    return imported.length;
  }, []);

  const runAgent = useCallback((prompt: string) => {
    const model = defaultModel;
    if (!model) return;

    const modelKeys = keys.filter((key) => key.modelProfileId === model.id);
    const strategy = model.routingStrategy ?? rule.strategy;
    const selected = selectKey(modelKeys, strategy, model.lastRoutedKeyId);
    if (!selected) return;

    const lowerPrompt = prompt.toLocaleLowerCase();
    const shouldFailover = lowerPrompt.includes("备用") || lowerPrompt.includes("故障");
    const alternate = shouldFailover
      ? selectKey(modelKeys.filter((key) => key.id !== selected.id), strategy, selected.id)
      : undefined;
    const usedKey = alternate ?? selected;
    const provider = providers.find((item) => item.id === model.providerId);
    const matchedMemories = rankMemories(memories, prompt);
    const sandboxProposal = deriveSandboxCommandProposal(prompt);
    const enabledToolCount = mcpTools.filter((tool) => tool.enabled && mcpServers.some((server) => server.id === tool.serverId && server.enabled)).length;
    setProviders((current) => current.map((provider) => ({
      ...provider,
      models: provider.models.map((item) => item.id === model.id ? { ...item, lastRoutedKeyId: usedKey.id } : item),
    })));
    const runId = `run-${Date.now()}`;
    const steps: RunStep[] = [
      { id: "plan", title: "解析任务", detail: "已生成本地执行计划", state: "complete" },
      ...(matchedMemories.length ? [{ id: "memory", title: "检索本地记忆", detail: `已引用：${matchedMemories.map((memory) => memory.title).join("、")}`, state: "complete" as const }] : []),
      ...(enabledToolCount ? [{ id: "mcp", title: "准备 MCP 工具", detail: `${enabledToolCount} 个已启用工具可供本次任务调用`, state: "complete" as const }] : []),
      ...(sandboxProposal ? [{ id: "sandbox", title: "请求沙盒终端", detail: `模型请求执行：$ ${sandboxProposal.command}（等待用户审阅）`, state: "warning" as const }] : []),
      {
        id: "route",
        title: "选择模型与密钥",
        detail: `${model.label} · ${getStrategyLabel(strategy)} · ••••${usedKey.suffix}`,
        state: alternate ? "warning" : "complete",
      },
      { id: "execute", title: "执行代理步骤", detail: "正在模拟兼容 API 调用", state: "running" },
    ];
    const tokenUsage = createTokenUsage(
      [prompt.trim(), ...matchedMemories.map((memory) => `${memory.title}\n${memory.content}`), enabledToolCount ? `${enabledToolCount} 个 MCP 工具可用` : ""].filter(Boolean).join("\n"),
      steps.map((step) => `${step.title}\n${step.detail}`).join("\n"),
    );
    const run: AgentRun = {
      id: runId,
      prompt: prompt.trim(),
      status: "running",
      modelLabel: model.label,
      keySuffix: usedKey.suffix,
      usedFallback: Boolean(alternate),
      createdAt: new Date().toISOString(),
      modelId: model.id,
      providerName: provider?.name,
      steps,
      tokenUsage,
    };

    setRuns((current) => [run, ...current].slice(0, 12));
    if (sandboxProposal) requestSandboxCommand(sandboxProposal.command, sandboxProposal.reason, runId);

    void (async () => {
      let actualTokenUsage: TokenUsage | undefined;
      let executionDetail = "演示调用已完成（未获得真实 usage）";
      try {
        const secret = await readSecret(usedKey.id);
        if (!provider || provider.protocol !== "OpenAI 兼容" || !secret || provider.baseUrl.includes("example.com")) throw new Error("当前模型未配置可用的真实兼容端点");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
          const response = await fetch(getCompletionEndpoint(provider.baseUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
            body: JSON.stringify({ model: model.modelId, messages: [{ role: "user", content: prompt.trim() }] }),
            signal: controller.signal,
          });
          const raw = await response.text();
          let payload: unknown;
          try { payload = raw ? JSON.parse(raw) : undefined; } catch { payload = undefined; }
          if (!response.ok) throw new Error(`服务端返回 HTTP ${response.status}`);
          actualTokenUsage = parseApiTokenUsage(payload);
          executionDetail = actualTokenUsage
            ? `真实调用完成 · 实际 ${actualTokenUsage.totalTokens.toLocaleString()} Token · ${getResponsePreview(payload)}`
            : "真实调用完成，但服务端未返回可识别的 usage 字段";
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        await new Promise<void>((resolve) => setTimeout(resolve, 750));
      }
      setRuns((current) => current.map((item) => item.id === runId ? {
        ...item,
        actualTokenUsage,
        status: "completed",
        steps: item.steps.map((step) => step.id === "execute" ? { ...step, state: "complete", detail: executionDetail } : step),
      } : item));
      setKeys((current) => current.map((key) => (key.id === usedKey.id ? { ...key, usage: key.usage + 1 } : key)));
    })();
  }, [defaultModel, keys, mcpServers, mcpTools, memories, providers, requestSandboxCommand, rule.strategy]);

  const clearRuns = useCallback(() => setRuns([]), []);

  const testProvider = useCallback(async (providerId: string, mode: ConnectionTestMode, modelId?: string) => {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return;
    const targetModel = provider.models.find((model) => model.id === modelId) ?? provider.models[0];
    if (!targetModel) return;
    const checkedAt = new Date().toISOString();
    const updateDiagnostic = (diagnostic: ProviderDiagnostic) => setProviders((current) => current.map((item) => item.id === providerId ? { ...item, diagnostic } : item));
    updateDiagnostic({ state: "testing", mode, message: mode === "direct" ? `正在测试 ${targetModel.label} 的兼容端点…` : `正在诊断 ${targetModel.label} 的本地路由…` });
    const providerKey = keys.find((key) => key.modelProfileId === targetModel.id && key.status === "healthy" && !isCooldownActive(key.cooldownUntil));
    const applyFailure = (reason: CooldownReason, message: string, statusCode?: number) => {
      updateDiagnostic({ state: "error", mode, message, checkedAt, statusCode });
      if (!providerKey) return;
      setKeys((current) => current.map((key) => {
        if (key.id !== providerKey.id) return key;
        const failureCount = (key.failureCount ?? 0) + 1;
        const forceCooldown = reason === "认证失败" || reason === "请求限流";
        const cooling = forceCooldown || shouldAutoCooldown({ failureCount, failureThreshold: rule.failureThreshold, usage: key.usage, quota: key.quota });
        return cooling ? { ...key, failureCount, status: "cooling", cooldownReason: reason, cooldownUntil: cooldownUntilAfter(rule.cooldownSeconds), lastError: message } : { ...key, failureCount, lastError: message };
      }));
    };
    if (mode === "simulated") {
      const sample = provider.baseUrl.toLowerCase();
      setTimeout(() => {
        if (sample.includes("authfail")) applyFailure("认证失败", "模拟诊断：认证被服务端拒绝", 401);
        else if (sample.includes("ratelimit")) applyFailure("请求限流", "模拟诊断：服务端返回限流", 429);
        else if (sample.includes("timeout") || sample.includes("offline")) applyFailure("连续失败", "模拟诊断：连接超时");
        else updateDiagnostic({ state: "healthy", mode, message: `模拟诊断通过：${targetModel.label} 的兼容端点可用`, checkedAt, latencyMs: 126, statusCode: 200 });
      }, 520);
      return;
    }
    if (!providerKey) {
      updateDiagnostic({ state: "error", mode, message: "没有可用于测试的密钥；请添加可用密钥或等待冷却结束。", checkedAt });
      return;
    }
    const secret = await readSecret(providerKey.id);
    if (!secret) {
      updateDiagnostic({ state: "error", mode, message: "本机安全存储中未找到该密钥；请重新添加后再测试。", checkedAt });
      return;
    }
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/models`, { headers: { Authorization: `Bearer ${secret}` }, signal: controller.signal });
      const latencyMs = Date.now() - startedAt;
      if (response.ok) updateDiagnostic({ state: "healthy", mode, message: `${targetModel.label} 真实直连测试通过`, checkedAt, latencyMs, statusCode: response.status });
      else if (response.status === 401 || response.status === 403) applyFailure("认证失败", `认证失败（HTTP ${response.status}）`, response.status);
      else if (response.status === 429) applyFailure("请求限流", "请求受到服务端限流（HTTP 429）", response.status);
      else applyFailure("连续失败", `服务端返回 HTTP ${response.status}`, response.status);
    } catch {
      applyFailure("连续失败", "无法连接服务端或请求超时");
    } finally {
      clearTimeout(timeout);
    }
  }, [keys, providers, rule.cooldownSeconds, rule.failureThreshold]);

  const value = useMemo<AgentStateValue>(
    () => ({
      hydrated,
      providers,
      keys,
      rule,
      runs,
      models,
      defaultModel,
      addProvider,
      addModel,
      removeModel,
      updateModelRouting,
      toggleProvider,
      removeProvider,
      addKey,
      removeKey,
      cycleKeyStatus,
      updateRule,
      runAgent,
      clearRuns,
      testProvider,
      mcpServers,
      mcpTools,
      memories,
      mcpCalls,
      toolAuthGrants,
      sandboxWorkspace,
      sandboxCommands,
      sandboxAutoApproveLowRisk,
      addMcpServer,
      removeMcpServer,
      testMcpServer,
      toggleMcpTool,
      checkToolAuth,
      grantToolAuth,
      revokeToolAuth,
      callMcpTool,
      requestSandboxCommand,
      approveSandboxCommand,
      rejectSandboxCommand,
      setSandboxAutoApproveLowRisk,
      addMemory,
      updateMemory,
      removeMemory,
      exportMemories,
      importMemories,
    }),
    [addKey, addMcpServer, addMemory, addModel, addProvider, approveSandboxCommand, callMcpTool, checkToolAuth, clearRuns, cycleKeyStatus, defaultModel, exportMemories, grantToolAuth, hydrated, importMemories, keys, mcpCalls, mcpServers, mcpTools, memories, models, providers, rejectSandboxCommand, removeKey, removeMcpServer, removeMemory, removeModel, removeProvider, requestSandboxCommand, revokeToolAuth, rule, runAgent, runs, sandboxAutoApproveLowRisk, sandboxCommands, sandboxWorkspace, testMcpServer, testProvider, toggleMcpTool, toggleProvider, toolAuthGrants, updateMemory, updateModelRouting, updateRule],
  );

  return <AgentStateContext.Provider value={value}>{children}</AgentStateContext.Provider>;
}

export function useAgentState() {
  const context = useContext(AgentStateContext);
  if (!context) throw new Error("useAgentState 必须在 AgentStateProvider 内使用");
  return context;
}

export function getKeyStatusLabel(status: KeyStatus) {
  const labels: Record<KeyStatus, string> = {
    healthy: "可用",
    cooling: "冷却中",
    disabled: "已停用",
  };
  return labels[status];
}

export { getStrategyLabel };
