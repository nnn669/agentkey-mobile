import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Badge, Card, COLORS } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { createActualTokenTrend, createTokenUsage, filterActualTokenRuns, sumTokenUsage, type TokenUsage } from "@/lib/agent-logic";
import { useAgentState, type AgentRun } from "@/lib/agent-state";

type DateRange = "7d" | "30d" | "all";

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "all", label: "全部" },
];

function getRunTokenUsage(run: AgentRun): TokenUsage {
  return run.tokenUsage ?? createTokenUsage(run.prompt, run.steps.map((step) => `${step.title}\n${step.detail}`).join("\n"));
}

function getRangeStart(range: DateRange, now = Date.now()) {
  if (range === "all") return undefined;
  return now - (range === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
}

export default function SettingsScreen() {
  const { runs } = useAgentState();
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [modelFilter, setModelFilter] = useState<string>();
  const [providerFilter, setProviderFilter] = useState<string>();
  const rangeStart = useMemo(() => getRangeStart(dateRange), [dateRange]);
  const runUsages = useMemo(() => runs.map((run) => ({ run: { ...run, providerName: run.providerName ?? "未标注供应商" }, estimatedUsage: getRunTokenUsage(run), actualUsage: run.actualTokenUsage })), [runs]);
  const actualSourceRuns = useMemo(() => runUsages.map(({ run, actualUsage }) => ({ ...run, actualTokenUsage: actualUsage })), [runUsages]);
  const modelOptions = useMemo(() => [...new Set(actualSourceRuns.filter((run) => run.actualTokenUsage).map((run) => run.modelLabel))], [actualSourceRuns]);
  const providerOptions = useMemo(() => [...new Set(actualSourceRuns.filter((run) => run.actualTokenUsage).map((run) => run.providerName))], [actualSourceRuns]);
  const filters = useMemo(() => ({ after: rangeStart, modelLabel: modelFilter, providerName: providerFilter }), [modelFilter, providerFilter, rangeStart]);
  const filteredActualRuns = useMemo(() => filterActualTokenRuns(actualSourceRuns, filters), [actualSourceRuns, filters]);
  const filteredRunUsages = useMemo(() => runUsages.filter(({ run }) => {
    const createdAt = Date.parse(run.createdAt);
    if (!Number.isFinite(createdAt)) return false;
    if (rangeStart !== undefined && createdAt < rangeStart) return false;
    if (modelFilter && run.modelLabel !== modelFilter) return false;
    return !providerFilter || run.providerName === providerFilter;
  }), [modelFilter, providerFilter, rangeStart, runUsages]);
  const estimatedTotal = useMemo(() => sumTokenUsage(filteredRunUsages.map((item) => item.estimatedUsage)), [filteredRunUsages]);
  const actualTotal = useMemo(() => sumTokenUsage(filteredActualRuns.map((run) => run.actualTokenUsage!)), [filteredActualRuns]);
  const trend = useMemo(() => createActualTokenTrend(filteredActualRuns), [filteredActualRuns]);

  return <ScreenContainer className="p-0" containerClassName="bg-background"><FlatList
    data={filteredRunUsages}
    keyExtractor={({ run }) => run.id}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View>
      <View style={styles.header}><View style={styles.headerIcon}><MaterialIcons name="settings" size={21} color={COLORS.mint} /></View><View style={styles.headerText}><Text style={styles.title}>设置</Text><Text style={styles.subtitle}>筛选真实 usage，追踪实际 Token 消耗趋势</Text></View></View>
      <Card style={styles.filterCard}>
        <View style={styles.filterTitleRow}><View><Text style={styles.filterTitle}>实际用量筛选</Text><Text style={styles.filterHint}>仅纳入 API 返回 `usage` 的任务</Text></View><Badge label={`${filteredActualRuns.length} 条实际记录`} tone="info" /></View>
        <FilterGroup label="日期"><OptionRow options={DATE_RANGE_OPTIONS} selected={dateRange} onSelect={(value) => setDateRange(value as DateRange)} /></FilterGroup>
        <FilterGroup label="模型"><OptionRow options={[{ value: "", label: "全部模型" }, ...modelOptions.map((value) => ({ value, label: value }))]} selected={modelFilter ?? ""} onSelect={(value) => setModelFilter(value || undefined)} /></FilterGroup>
        <FilterGroup label="供应商"><OptionRow options={[{ value: "", label: "全部供应商" }, ...providerOptions.map((value) => ({ value, label: value }))]} selected={providerFilter ?? ""} onSelect={(value) => setProviderFilter(value || undefined)} /></FilterGroup>
      </Card>
      <TokenTrendChart points={trend} />
      <Card style={styles.totalCard}><View style={styles.totalTop}><View><Text style={styles.eyebrow}>当前筛选范围</Text><Text style={styles.totalLabel}>共 {filteredRunUsages.length} 条任务，其中 {filteredActualRuns.length} 条返回实际 usage</Text></View><View style={styles.totalIcon}><MaterialIcons name="compare-arrows" size={25} color={COLORS.mint} /></View></View><View style={styles.comparisonRow}><ComparisonCell label="本地估算" value={estimatedTotal.totalTokens} color={COLORS.mint} /><View style={styles.divider} /><ComparisonCell label="实际消耗" value={filteredActualRuns.length ? actualTotal.totalTokens : undefined} color={COLORS.blue} /></View><View style={styles.breakdown}><BreakdownCell label="估算输入" value={estimatedTotal.inputTokens} color={COLORS.amber} /><View style={styles.divider} /><BreakdownCell label="估算输出" value={estimatedTotal.outputTokens} color={COLORS.mint} /><View style={styles.divider} /><BreakdownCell label="实际任务" value={filteredActualRuns.length} color={COLORS.blue} /></View></Card>
      <Card style={styles.infoCard}><MaterialIcons name="info-outline" size={19} color={COLORS.blue} /><Text style={styles.infoText}>实际消耗仅来自兼容 API 响应中的 `usage` 字段。服务端未返回 usage 的任务不会进入趋势图或实际总数，但会在下方明细中保留本地估算。</Text></Card>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>筛选后的对话明细</Text><Badge label={`${filteredRunUsages.length} 条`} tone="info" /></View>
    </View>}
    renderItem={({ item }) => <RunUsageCard actualUsage={item.actualUsage} run={item.run} usage={item.estimatedUsage} />}
    ListEmptyComponent={<Card style={styles.emptyCard}><MaterialIcons name="bar-chart" size={28} color={COLORS.muted} /><Text style={styles.emptyTitle}>筛选范围内暂无记录</Text><Text style={styles.emptyText}>调整日期、模型或供应商筛选，或运行一条代理任务后再查看 Token 统计。</Text></Card>}
  /></ScreenContainer>;
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.filterGroup}><Text style={styles.filterLabel}>{label}</Text>{children}</View>;
}

function OptionRow({ options, selected, onSelect }: { options: { value: string; label: string }[]; selected: string; onSelect: (value: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{options.map((option) => <Pressable key={option.value || "all"} onPress={() => onSelect(option.value)} style={({ pressed }) => [styles.option, selected === option.value && styles.optionSelected, pressed && styles.pressed]}><Text numberOfLines={1} style={[styles.optionText, selected === option.value && styles.optionTextSelected]}>{option.label}</Text></Pressable>)}</ScrollView>;
}

function TokenTrendChart({ points }: { points: ReturnType<typeof createActualTokenTrend> }) {
  const peak = Math.max(...points.map((point) => point.totalTokens), 1);
  return <Card style={styles.trendCard}><View style={styles.trendHeader}><View><Text style={styles.trendTitle}>实际 Token 消耗趋势</Text><Text style={styles.trendSub}>按任务创建日期聚合 · 仅真实 usage</Text></View><MaterialIcons name="show-chart" size={22} color={COLORS.blue} /></View>{points.length ? <View style={styles.chart}>{points.map((point) => <View key={point.date} style={styles.barColumn}><Text style={styles.barValue}>{formatToken(point.totalTokens)}</Text><View style={styles.barTrack}><View style={[styles.barFill, { height: Math.max(5, Math.round((point.totalTokens / peak) * 118)) }]} /></View><Text style={styles.barLabel}>{formatDate(point.date)}</Text></View>)}</View> : <View style={styles.noTrend}><MaterialIcons name="query-stats" size={22} color={COLORS.muted} /><Text style={styles.noTrendText}>当前筛选范围没有服务商返回的实际 usage，暂无法绘制趋势。</Text></View>}<View style={styles.trendFooter}><Text style={styles.trendFooterText}>合计 {points.reduce((total, point) => total + point.totalTokens, 0).toLocaleString()} Token</Text><Text style={styles.trendFooterText}>{points.reduce((total, point) => total + point.runCount, 0)} 条实际调用</Text></View></Card>;
}

function formatToken(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value.toString();
}

function formatDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function BreakdownCell({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={styles.breakdownCell}><View style={[styles.breakdownDot, { backgroundColor: color }]} /><Text style={styles.breakdownLabel}>{label}</Text><Text style={styles.breakdownValue}>{value.toLocaleString()}</Text></View>;
}

function ComparisonCell({ label, value, color }: { label: string; value?: number; color: string }) {
  return <View style={styles.comparisonCell}><Text style={[styles.comparisonValue, { color }]}>{value === undefined ? "—" : value.toLocaleString()}</Text><Text style={styles.comparisonLabel}>{label}</Text></View>;
}

function RunUsageCard({ run, usage, actualUsage }: { run: AgentRun; usage: TokenUsage; actualUsage?: TokenUsage }) {
  return <Card style={styles.runCard}><View style={styles.runTop}><View style={styles.runIcon}><MaterialIcons name="forum" size={18} color={COLORS.mint} /></View><View style={styles.runText}><Text numberOfLines={2} style={styles.runPrompt}>{run.prompt}</Text><Text style={styles.runMeta}>{run.providerName ?? "未标注供应商"} · {run.modelLabel} · {new Date(run.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text></View><Badge label={actualUsage ? "已返回 usage" : "仅估算"} tone={actualUsage ? "success" : "neutral"} /></View><View style={styles.runBreakdown}><Text style={styles.runBreakdownText}>估算 {usage.totalTokens.toLocaleString()}（入 {usage.inputTokens.toLocaleString()} / 出 {usage.outputTokens.toLocaleString()}）</Text><Text style={[styles.runBreakdownText, actualUsage && styles.actualText]}>实际 {actualUsage ? `${actualUsage.totalTokens.toLocaleString()}（入 ${actualUsage.inputTokens.toLocaleString()} / 出 ${actualUsage.outputTokens.toLocaleString()}）` : "未返回"}</Text></View></Card>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 34 },
  header: { alignItems: "center", flexDirection: "row", gap: 11, marginBottom: 18 },
  headerIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 13, height: 44, justifyContent: "center", width: 44 },
  headerText: { flex: 1 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  filterCard: { marginBottom: 12 },
  filterTitleRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  filterTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  filterHint: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  filterGroup: { marginTop: 14 },
  filterLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "800", marginBottom: 7 },
  optionRow: { gap: 7 },
  option: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 10, borderWidth: 1, maxWidth: 152, paddingHorizontal: 11, paddingVertical: 8 },
  optionSelected: { backgroundColor: "#153B38", borderColor: COLORS.mint },
  optionText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  optionTextSelected: { color: COLORS.mint },
  trendCard: { marginBottom: 12 },
  trendHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  trendTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  trendSub: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  chart: { alignItems: "flex-end", borderBottomColor: COLORS.border, borderBottomWidth: 1, flexDirection: "row", gap: 8, height: 160, marginTop: 15, overflow: "hidden", paddingHorizontal: 2 },
  barColumn: { alignItems: "center", flex: 1, height: 154, justifyContent: "flex-end", minWidth: 32 },
  barValue: { color: COLORS.muted, fontSize: 9, fontWeight: "700", marginBottom: 5 },
  barTrack: { backgroundColor: "#0A1A26", borderRadius: 7, height: 118, justifyContent: "flex-end", overflow: "hidden", width: "100%" },
  barFill: { backgroundColor: COLORS.blue, borderRadius: 7, width: "100%" },
  barLabel: { color: COLORS.muted, fontSize: 9, marginTop: 5 },
  noTrend: { alignItems: "center", backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 9, marginTop: 14, padding: 13 },
  noTrendText: { color: COLORS.muted, flex: 1, fontSize: 11, lineHeight: 16 },
  trendFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 11 },
  trendFooterText: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  totalCard: { backgroundColor: "#102C36", borderColor: "#28756E", marginBottom: 12 },
  totalTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  eyebrow: { color: COLORS.mint, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  totalLabel: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
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
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
