import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Badge, Card, COLORS } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { createTokenUsage, sumTokenUsage, type TokenUsage } from "@/lib/agent-logic";
import { useAgentState, type AgentRun } from "@/lib/agent-state";

function getRunTokenUsage(run: AgentRun): TokenUsage {
  return run.tokenUsage ?? createTokenUsage(run.prompt, run.steps.map((step) => `${step.title}\n${step.detail}`).join("\n"));
}

export default function SettingsScreen() {
  const { runs } = useAgentState();
  const runUsages = useMemo(() => runs.map((run) => ({ run, estimatedUsage: getRunTokenUsage(run), actualUsage: run.actualTokenUsage })), [runs]);
  const estimatedTotal = useMemo(() => sumTokenUsage(runUsages.map((item) => item.estimatedUsage)), [runUsages]);
  const actualRuns = useMemo(() => runUsages.flatMap((item) => item.actualUsage ? [item.actualUsage] : []), [runUsages]);
  const actualTotal = useMemo(() => sumTokenUsage(actualRuns), [actualRuns]);

  return <ScreenContainer className="p-0" containerClassName="bg-background"><FlatList
    data={runUsages}
    keyExtractor={({ run }) => run.id}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View><View style={styles.header}><View style={styles.headerIcon}><MaterialIcons name="settings" size={21} color={COLORS.mint} /></View><View style={styles.headerText}><Text style={styles.title}>设置</Text><Text style={styles.subtitle}>本地估算与服务商实际 Token 对比</Text></View></View><Card style={styles.totalCard}><View style={styles.totalTop}><View><Text style={styles.eyebrow}>全部对话 Token</Text><Text style={styles.totalLabel}>统计 {runs.length} 条任务，其中 {actualRuns.length} 条返回实际 usage</Text></View><View style={styles.totalIcon}><MaterialIcons name="compare-arrows" size={25} color={COLORS.mint} /></View></View><View style={styles.comparisonRow}><ComparisonCell label="本地估算" value={estimatedTotal.totalTokens} color={COLORS.mint} /><View style={styles.divider} /><ComparisonCell label="实际消耗" value={actualRuns.length ? actualTotal.totalTokens : undefined} color={COLORS.blue} /></View><View style={styles.breakdown}><BreakdownCell label="估算输入" value={estimatedTotal.inputTokens} color={COLORS.amber} /><View style={styles.divider} /><BreakdownCell label="估算输出" value={estimatedTotal.outputTokens} color={COLORS.mint} /><View style={styles.divider} /><BreakdownCell label="实际任务" value={actualRuns.length} color={COLORS.blue} /></View></Card><Card style={styles.infoCard}><MaterialIcons name="info-outline" size={19} color={COLORS.blue} /><Text style={styles.infoText}>实际消耗仅记录兼容 API 响应中的 `usage` 字段。未返回 usage 的对话不会计入实际总数，仍保留独立的本地估算供参考。</Text></Card><View style={styles.sectionRow}><Text style={styles.sectionTitle}>全部对话明细</Text><Badge label={`${runs.length} 条`} tone="info" /></View></View>}
    renderItem={({ item }) => <RunUsageCard actualUsage={item.actualUsage} run={item.run} usage={item.estimatedUsage} />}
    ListEmptyComponent={<Card style={styles.emptyCard}><MaterialIcons name="bar-chart" size={28} color={COLORS.muted} /><Text style={styles.emptyTitle}>尚无 Token 记录</Text><Text style={styles.emptyText}>开始一条代理任务后，这里会汇总全部对话的输入、输出和总 Token 估算。</Text></Card>}
  /></ScreenContainer>;
}

function BreakdownCell({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={styles.breakdownCell}><View style={[styles.breakdownDot, { backgroundColor: color }]} /><Text style={styles.breakdownLabel}>{label}</Text><Text style={styles.breakdownValue}>{value.toLocaleString()}</Text></View>;
}

function ComparisonCell({ label, value, color }: { label: string; value?: number; color: string }) {
  return <View style={styles.comparisonCell}><Text style={[styles.comparisonValue, { color }]}>{value === undefined ? "—" : value.toLocaleString()}</Text><Text style={styles.comparisonLabel}>{label}</Text></View>;
}

function RunUsageCard({ run, usage, actualUsage }: { run: AgentRun; usage: TokenUsage; actualUsage?: TokenUsage }) {
  return <Card style={styles.runCard}><View style={styles.runTop}><View style={styles.runIcon}><MaterialIcons name="forum" size={18} color={COLORS.mint} /></View><View style={styles.runText}><Text numberOfLines={2} style={styles.runPrompt}>{run.prompt}</Text><Text style={styles.runMeta}>{run.modelLabel} · {new Date(run.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text></View><Badge label={actualUsage ? "已返回 usage" : "仅估算"} tone={actualUsage ? "success" : "neutral"} /></View><View style={styles.runBreakdown}><Text style={styles.runBreakdownText}>估算 {usage.totalTokens.toLocaleString()}（入 {usage.inputTokens.toLocaleString()} / 出 {usage.outputTokens.toLocaleString()}）</Text><Text style={[styles.runBreakdownText, actualUsage && styles.actualText]}>实际 {actualUsage ? `${actualUsage.totalTokens.toLocaleString()}（入 ${actualUsage.inputTokens.toLocaleString()} / 出 ${actualUsage.outputTokens.toLocaleString()}）` : "未返回"}</Text></View></Card>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 34 },
  header: { alignItems: "center", flexDirection: "row", gap: 11, marginBottom: 18 },
  headerIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 13, height: 44, justifyContent: "center", width: 44 },
  headerText: { flex: 1 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  totalCard: { backgroundColor: "#102C36", borderColor: "#28756E", marginBottom: 12 },
  totalTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  eyebrow: { color: COLORS.mint, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  totalValue: { color: COLORS.text, fontSize: 34, fontWeight: "800", letterSpacing: -1.1, marginTop: 5 },
  totalLabel: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  totalIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 13, height: 46, justifyContent: "center", width: 46 },
  comparisonRow: { alignItems: "center", borderTopColor: "#28756E", borderTopWidth: 1, flexDirection: "row", marginTop: 16, paddingTop: 14 },
  comparisonCell: { alignItems: "center", flex: 1 },
  comparisonValue: { fontSize: 24, fontWeight: "800", letterSpacing: -0.7 },
  comparisonLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  breakdown: { alignItems: "center", borderTopColor: "#28756E", borderTopWidth: 1, flexDirection: "row", marginTop: 16, paddingTop: 14 },
  breakdownCell: { alignItems: "center", flex: 1 },
  breakdownDot: { borderRadius: 99, height: 6, marginBottom: 5, width: 6 },
  breakdownLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  breakdownValue: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginTop: 2 },
  divider: { backgroundColor: "#28756E", height: 31, width: 1 },
  infoCard: { alignItems: "flex-start", flexDirection: "row", gap: 10, marginBottom: 21 },
  infoText: { color: COLORS.muted, flex: 1, fontSize: 11, lineHeight: 16 },
  sectionRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  emptyCard: { alignItems: "center", padding: 25 },
  emptyTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginTop: 8 },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: "center" },
  runCard: { marginBottom: 10 },
  runTop: { alignItems: "center", flexDirection: "row", gap: 10 },
  runIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 11, height: 38, justifyContent: "center", width: 38 },
  runText: { flex: 1 },
  runPrompt: { color: COLORS.text, fontSize: 13, fontWeight: "800", lineHeight: 18 },
  runMeta: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  runBreakdown: { borderTopColor: COLORS.border, borderTopWidth: 1, gap: 6, marginTop: 12, paddingTop: 10 },
  runBreakdownText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  actualText: { color: COLORS.blue },
});
