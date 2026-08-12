import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { getStrategyLabel, selectKey, type KeyStatus, type RoutingStrategy } from "@/lib/agent-logic";

const STORAGE_KEY = "agentkey.public-config.v1";
const SECRET_PREFIX = "agentkey.secret.";

export type ModelProfile = {
  id: string;
  providerId: string;
  modelId: string;
  label: string;
  enabled: boolean;
};

export type ApiProvider = {
  id: string;
  name: string;
  baseUrl: string;
  protocol: "OpenAI 兼容" | "自定义 REST";
  enabled: boolean;
  models: ModelProfile[];
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
  steps: RunStep[];
};

type PersistedState = {
  providers: ApiProvider[];
  keys: KeyEntry[];
  rule: RoutingRule;
  runs: AgentRun[];
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
  },
];

const seedRule: RoutingRule = {
  defaultModelId: "model-reasoning-v1",
  strategy: "priority",
  failureThreshold: 2,
  cooldownSeconds: 45,
};

type AgentStateValue = {
  hydrated: boolean;
  providers: ApiProvider[];
  keys: KeyEntry[];
  rule: RoutingRule;
  runs: AgentRun[];
  models: ModelProfile[];
  defaultModel?: ModelProfile;
  addProvider: (name: string, baseUrl: string, modelLabel: string) => void;
  toggleProvider: (providerId: string) => void;
  removeProvider: (providerId: string) => void;
  addKey: (modelProfileId: string, label: string, secret: string) => Promise<boolean>;
  cycleKeyStatus: (keyId: string) => void;
  updateRule: (patch: Partial<RoutingRule>) => void;
  runAgent: (prompt: string) => void;
  clearRuns: () => void;
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

export function AgentStateProvider({ children }: PropsWithChildren) {
  const [providers, setProviders] = useState<ApiProvider[]>(seedProviders);
  const [keys, setKeys] = useState<KeyEntry[]>(seedKeys);
  const [rule, setRule] = useState<RoutingRule>(seedRule);
  const [runs, setRuns] = useState<AgentRun[]>([]);
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
      } finally {
        setHydrated(true);
      }
    };

    void loadState();
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const payload: PersistedState = { providers, keys, rule, runs };
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [hydrated, keys, providers, rule, runs]);

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

  const toggleProvider = useCallback((providerId: string) => {
    setProviders((current) =>
      current.map((provider) =>
        provider.id === providerId ? { ...provider, enabled: !provider.enabled } : provider,
      ),
    );
  }, []);

  const removeProvider = useCallback((providerId: string) => {
    setProviders((current) => current.filter((provider) => provider.id !== providerId));
    setKeys((current) => current.filter((key) => !providers.find((provider) => provider.id === providerId)?.models.some((model) => model.id === key.modelProfileId)));
  }, [providers]);

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

  const cycleKeyStatus = useCallback((keyId: string) => {
    const next: Record<KeyStatus, KeyStatus> = {
      healthy: "cooling",
      cooling: "disabled",
      disabled: "healthy",
    };
    setKeys((current) => current.map((key) => (key.id === keyId ? { ...key, status: next[key.status] } : key)));
  }, []);

  const updateRule = useCallback((patch: Partial<RoutingRule>) => {
    setRule((current) => ({ ...current, ...patch }));
  }, []);

  const runAgent = useCallback((prompt: string) => {
    const model = defaultModel;
    if (!model) return;

    const modelKeys = keys.filter((key) => key.modelProfileId === model.id);
    const selected = selectKey(modelKeys, rule.strategy);
    if (!selected) return;

    const lowerPrompt = prompt.toLocaleLowerCase();
    const shouldFailover = lowerPrompt.includes("备用") || lowerPrompt.includes("故障");
    const alternate = shouldFailover
      ? selectKey(modelKeys.filter((key) => key.id !== selected.id), rule.strategy)
      : undefined;
    const usedKey = alternate ?? selected;
    const runId = `run-${Date.now()}`;
    const run: AgentRun = {
      id: runId,
      prompt: prompt.trim(),
      status: "running",
      modelLabel: model.label,
      keySuffix: usedKey.suffix,
      usedFallback: Boolean(alternate),
      createdAt: new Date().toISOString(),
      steps: [
        { id: "plan", title: "解析任务", detail: "已生成本地执行计划", state: "complete" },
        {
          id: "route",
          title: "选择模型与密钥",
          detail: `${model.label} · ••••${usedKey.suffix}`,
          state: alternate ? "warning" : "complete",
        },
        { id: "execute", title: "执行代理步骤", detail: "正在模拟兼容 API 调用", state: "running" },
      ],
    };

    setRuns((current) => [run, ...current].slice(0, 12));

    setTimeout(() => {
      setRuns((current) =>
        current.map((item) =>
          item.id === runId
            ? {
                ...item,
                status: "completed",
                steps: item.steps.map((step) =>
                  step.id === "execute" ? { ...step, state: "complete", detail: "演示调用已完成" } : step,
                ),
              }
            : item,
        ),
      );
      setKeys((current) => current.map((key) => (key.id === usedKey.id ? { ...key, usage: key.usage + 1 } : key)));
    }, 750);
  }, [defaultModel, keys, rule.strategy]);

  const clearRuns = useCallback(() => setRuns([]), []);

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
      toggleProvider,
      removeProvider,
      addKey,
      cycleKeyStatus,
      updateRule,
      runAgent,
      clearRuns,
    }),
    [addKey, addProvider, clearRuns, cycleKeyStatus, defaultModel, hydrated, keys, models, providers, removeProvider, rule, runAgent, runs, toggleProvider, updateRule],
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
