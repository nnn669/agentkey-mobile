import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AgentMark, Badge, Card, COLORS, SectionTitle } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { getStrategyLabel, useAgentState } from "@/lib/agent-state";

export default function HomeScreen() {
  const router = useRouter();
  const { defaultModel, keys, providers, rule, runs, hydrated } = useAgentState();
  const activeKeys = useMemo(() => keys.filter((key) => key.status === "healthy"), [keys]);
  const usedCalls = useMemo(() => keys.reduce((total, key) => total + key.usage, 0), [keys]);
  const latestRun = runs[0];

  return (
    <ScreenContainer containerClassName="bg-background" className="p-0">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <AgentMark size={42} />
            <View>
              <Text style={styles.brand}>AgentKey</Text>
              <Text style={styles.brandSub}>多模型代理工作台</Text>
            </View>
          </View>
          <Badge label={hydrated ? "本地已就绪" : "加载配置"} tone={hydrated ? "success" : "warning"} />
        </View>

        <Card style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.eyebrow}>默认代理</Text>
              <Text style={styles.modelName}>{defaultModel?.label ?? "等待添加模型"}</Text>
              <Text style={styles.modelMeta}>通过 {getStrategyLabel(rule.strategy)} 选择可用密钥</Text>
            </View>
            <View style={styles.orb}>
              <MaterialIcons name="auto-awesome" color={COLORS.mint} size={28} />
            </View>
          </View>
          <View style={styles.routeLine}>
            <View style={styles.routeDot} />
            <Text style={styles.routeText}>{activeKeys.length} 个密钥待命 · {providers.filter((provider) => provider.enabled).length} 个 API 已启用</Text>
          </View>
        </Card>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{activeKeys.length}</Text>
            <Text style={styles.metricLabel}>可用密钥</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{providers.length}</Text>
            <Text style={styles.metricLabel}>API 供应商</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{usedCalls}</Text>
            <Text style={styles.metricLabel}>演示调用量</Text>
          </View>
        </View>

        <SectionTitle title="快速操作" />
        <View style={styles.quickRow}>
          <Pressable onPress={() => router.push("/tasks")} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
            <View style={[styles.quickIcon, styles.quickIconMint]}><MaterialIcons name="play-arrow" size={22} color={COLORS.background} /></View>
            <Text style={styles.quickTitle}>运行代理</Text>
            <Text style={styles.quickHint}>输入任务并查看轨迹</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/providers")} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
            <View style={[styles.quickIcon, styles.quickIconBlue]}><MaterialIcons name="add-link" size={21} color={COLORS.text} /></View>
            <Text style={styles.quickTitle}>添加 API</Text>
            <Text style={styles.quickHint}>配置兼容服务商</Text>
          </Pressable>
        </View>

        <SectionTitle title="当前路由" action="查看规则" onAction={() => router.push("/rules")} />
        <Card>
          <View style={styles.routingHeader}>
            <View style={styles.routingIcon}><MaterialIcons name="alt-route" size={22} color={COLORS.blue} /></View>
            <View style={styles.routingTextWrap}>
              <Text style={styles.routingTitle}>{getStrategyLabel(rule.strategy)}</Text>
              <Text style={styles.routingDetail}>连续失败 {rule.failureThreshold} 次后，冷却 {rule.cooldownSeconds} 秒并尝试备用密钥。</Text>
            </View>
          </View>
        </Card>

        <SectionTitle title="最近执行" action="任务列表" onAction={() => router.push("/tasks")} />
        {latestRun ? (
          <Card>
            <View style={styles.runHeader}>
              <View style={styles.runIcon}><MaterialIcons name={latestRun.status === "completed" ? "check" : "more-horiz"} color={COLORS.mint} size={20} /></View>
              <View style={styles.runTextWrap}>
                <Text numberOfLines={1} style={styles.runPrompt}>{latestRun.prompt}</Text>
                <Text style={styles.runMeta}>{latestRun.modelLabel} · ••••{latestRun.keySuffix}{latestRun.usedFallback ? " · 已切换备用密钥" : ""}</Text>
              </View>
            </View>
          </Card>
        ) : (
          <Card style={styles.emptyCard}>
            <MaterialIcons name="history" size={23} color={COLORS.muted} />
            <Text style={styles.emptyText}>还没有任务记录。运行一次代理即可查看脱敏执行轨迹。</Text>
          </Card>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 14 },
  topRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  brand: { color: COLORS.text, fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  brandSub: { color: COLORS.muted, fontSize: 12, marginTop: 1 },
  heroCard: { overflow: "hidden", padding: 18 },
  heroGlow: { backgroundColor: "#1D5C61", borderRadius: 120, height: 170, opacity: 0.34, position: "absolute", right: -72, top: -96, width: 170 },
  heroHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  eyebrow: { color: COLORS.mint, fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginBottom: 7 },
  modelName: { color: COLORS.text, fontSize: 25, fontWeight: "800", letterSpacing: -0.6 },
  modelMeta: { color: COLORS.muted, fontSize: 13, marginTop: 5 },
  orb: { alignItems: "center", backgroundColor: "#183D44", borderColor: "#28756E", borderRadius: 18, borderWidth: 1, height: 54, justifyContent: "center", width: 54 },
  routeLine: { alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", gap: 8, marginTop: 19, paddingTop: 14 },
  routeDot: { backgroundColor: COLORS.mint, borderRadius: 8, height: 8, width: 8 },
  routeText: { color: COLORS.text, fontSize: 12, fontWeight: "600" },
  metricsRow: { flexDirection: "row", gap: 10, marginBottom: 22, marginTop: 12 },
  metricCard: { backgroundColor: "#0F2230", borderColor: COLORS.border, borderRadius: 15, borderWidth: 1, flex: 1, minHeight: 80, padding: 12 },
  metricValue: { color: COLORS.text, fontSize: 22, fontWeight: "800" },
  metricLabel: { color: COLORS.muted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  quickRow: { flexDirection: "row", gap: 12, marginBottom: 22 },
  quickCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 19, borderWidth: 1, flex: 1, minHeight: 132, padding: 14 },
  quickIcon: { alignItems: "center", borderRadius: 11, height: 38, justifyContent: "center", marginBottom: 12, width: 38 },
  quickIconMint: { backgroundColor: COLORS.mint },
  quickIconBlue: { backgroundColor: "#244979" },
  quickTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  quickHint: { color: COLORS.muted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  routingHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  routingIcon: { alignItems: "center", backgroundColor: "#183860", borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  routingTextWrap: { flex: 1 },
  routingTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  routingDetail: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  runHeader: { alignItems: "center", flexDirection: "row", gap: 11 },
  runIcon: { alignItems: "center", backgroundColor: "#143E3A", borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  runTextWrap: { flex: 1 },
  runPrompt: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  runMeta: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  emptyCard: { alignItems: "center", flexDirection: "row", gap: 10 },
  emptyText: { color: COLORS.muted, flex: 1, fontSize: 12, lineHeight: 18 },
  bottomSpace: { height: 28 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
