import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Badge, Card, COLORS, PrimaryButton } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { createTokenUsage, type TokenUsage } from "@/lib/agent-logic";
import { useAgentState, type AgentRun, type SandboxCommand } from "@/lib/agent-state";

export default function TasksScreen() {
  const router = useRouter();
  const { approveSandboxCommand, defaultModel, models, rejectSandboxCommand, runs, runAgent, sandboxCommands, clearRuns, updateRule } = useAgentState();
  const [prompt, setPrompt] = useState("分析当前 API 密钥池，并给出稳定性摘要");
  const [statsVisible, setStatsVisible] = useState(false);
  const [terminalReviewVisible, setTerminalReviewVisible] = useState(false);
  const running = useMemo(() => runs.some((run) => run.status === "running"), [runs]);
  const currentUsage = useMemo(() => runs[0] ? getRunTokenUsage(runs[0]) : undefined, [runs]);
  const currentActualUsage = runs[0]?.actualTokenUsage;
  const pendingSandboxCommand = useMemo(() => sandboxCommands.find((command) => command.status === "pending"), [sandboxCommands]);

  useEffect(() => {
    if (pendingSandboxCommand) setTerminalReviewVisible(true);
  }, [pendingSandboxCommand]);

  const submit = () => {
    if (!prompt.trim()) return;
    runAgent(prompt);
  };

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <FlatList
        data={runs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RunCard run={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.titleRow}>
              <View style={styles.titleText}><Text style={styles.title}>代理任务</Text><Text style={styles.subtitle}>在本地演示模式中规划、路由并记录执行步骤。</Text></View>
              <View style={styles.titleActions}>
                <Pressable accessibilityLabel="打开受限沙盒终端" onPress={() => router.push("/shell" as never)} style={({ pressed }) => [styles.terminalButton, pressed && styles.pressed]}><MaterialIcons name="terminal" size={20} color={COLORS.amber} /></Pressable>
                <Pressable accessibilityLabel="查看当前对话 Token 统计" onPress={() => setStatsVisible(true)} style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}><MaterialIcons name="settings" size={20} color={COLORS.mint} /></Pressable>
              </View>
            </View>

            <Card style={styles.composerCard}>
              <View style={styles.modelRow}>
                <View style={styles.modelMark}><MaterialIcons name="psychology" size={19} color={COLORS.mint} /></View>
                <View style={styles.modelInfo}>
                  <Text style={styles.modelCaption}>本次默认模型</Text>
                  <Text style={styles.modelTitle}>{defaultModel?.label ?? "请先添加模型"}</Text>
                </View>
                <Badge label="本地演示" tone="info" />
              </View>
              <Text style={styles.modelPickerLabel}>选择执行模型</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelPicker}>
                {models.map((model) => <Pressable key={model.id} onPress={() => updateRule({ defaultModelId: model.id })} style={({ pressed }) => [styles.modelOption, defaultModel?.id === model.id && styles.modelOptionSelected, pressed && styles.pressed]}><MaterialIcons name={defaultModel?.id === model.id ? "radio-button-checked" : "radio-button-unchecked"} size={15} color={defaultModel?.id === model.id ? COLORS.mint : COLORS.muted} /><Text style={[styles.modelOptionText, defaultModel?.id === model.id && styles.modelOptionTextSelected]}>{model.label}</Text></Pressable>)}
              </ScrollView>
              <TextInput
                multiline
                value={prompt}
                onChangeText={setPrompt}
                placeholder="描述希望代理完成的任务…"
                placeholderTextColor="#7590A0"
                textAlignVertical="top"
                style={styles.input}
              />
              <Text style={styles.helper}>输入“备用”或“故障”可模拟主密钥失败后的自动切换。输入“终端执行: ls”可让模型请求受限沙盒命令。</Text>
              <PrimaryButton label={running ? "正在执行演示" : "运行代理"} icon="play-arrow" onPress={submit} disabled={!prompt.trim() || running || !defaultModel} />
            </Card>

            <View style={styles.historyTitleRow}>
              <View>
                <Text style={styles.historyTitle}>执行记录</Text>
                <Text style={styles.historySub}>仅保留脱敏轨迹和本地演示数据</Text>
              </View>
              {runs.length ? (
                <Pressable onPress={clearRuns} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
                  <Text style={styles.clearText}>清除</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <MaterialIcons name="account-tree" size={26} color={COLORS.muted} />
            <Text style={styles.emptyTitle}>等待第一个代理任务</Text>
            <Text style={styles.emptyText}>任务运行后，这里会显示模型选择、密钥尾号和故障切换步骤。</Text>
          </Card>
        }
      />
      <TokenStatsModal actualUsage={currentActualUsage} usage={currentUsage} run={runs[0]} onClose={() => setStatsVisible(false)} onOpenSettings={() => { setStatsVisible(false); router.push("/settings" as never); }} visible={statsVisible} />
      <SandboxAuthorizationModal command={pendingSandboxCommand} onApprove={() => { if (pendingSandboxCommand) approveSandboxCommand(pendingSandboxCommand.id); setTerminalReviewVisible(false); }} onClose={() => setTerminalReviewVisible(false)} onReject={() => { if (pendingSandboxCommand) rejectSandboxCommand(pendingSandboxCommand.id); setTerminalReviewVisible(false); }} visible={terminalReviewVisible && Boolean(pendingSandboxCommand)} />
    </ScreenContainer>
  );
}

function getRunTokenUsage(run: AgentRun): TokenUsage {
  return run.tokenUsage ?? createTokenUsage(run.prompt, run.steps.map((step) => `${step.title}\n${step.detail}`).join("\n"));
}

function TokenStatsModal({ visible, usage, actualUsage, run, onClose, onOpenSettings }: { visible: boolean; usage?: TokenUsage; actualUsage?: TokenUsage; run?: AgentRun; onClose: () => void; onOpenSettings: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>当前对话 Token 统计</Text><Text style={styles.sheetSub}>真实 API usage 会在服务商返回后与本地估算并列显示。</Text></View><Pressable onPress={onClose} style={styles.closeButton}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable></View>{usage && run ? <><Card style={styles.totalCard}><View style={styles.usageComparison}><UsageTotal label="本地估算" value={usage.totalTokens} color={COLORS.mint} /><View style={styles.usageDivider} /><UsageTotal label="实际消耗" value={actualUsage?.totalTokens} color={COLORS.blue} /></View><Text numberOfLines={2} style={styles.runName}>{run.prompt}</Text></Card><View style={styles.tokenRow}><TokenMetric label="估算输入" value={usage.inputTokens} color={COLORS.amber} /><TokenMetric label="估算输出" value={usage.outputTokens} color={COLORS.mint} /></View>{actualUsage ? <View style={styles.tokenRow}><TokenMetric label="实际输入" value={actualUsage.inputTokens} color={COLORS.blue} /><TokenMetric label="实际输出" value={actualUsage.outputTokens} color={COLORS.blue} /></View> : <View style={styles.usageUnavailable}><MaterialIcons name="cloud-off" size={16} color={COLORS.muted} /><Text style={styles.usageUnavailableText}>此任务未收到服务商的 usage 字段，暂仅显示本地估算。</Text></View>}</> : <Card style={styles.emptyStats}><MaterialIcons name="forum" size={24} color={COLORS.muted} /><Text style={styles.emptyText}>尚无任务对话。运行代理后会在这里显示当前对话的 Token 统计。</Text></Card>}<Text style={styles.statsNote}>实际值仅来自兼容 API 响应的 `usage` 字段；未返回时不会以估算值替代实际账单数据。</Text><PrimaryButton label="查看全部 Token 统计" icon="bar-chart" onPress={onOpenSettings} /></View></View></Modal>;
}

function UsageTotal({ label, value, color }: { label: string; value?: number; color: string }) {
  return <View style={styles.usageTotal}><Text style={[styles.totalValue, { color }]}>{value === undefined ? "—" : value.toLocaleString()}</Text><Text style={styles.totalLabel}>{label}</Text></View>;
}

function TokenMetric({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={styles.tokenMetric}><View style={[styles.tokenDot, { backgroundColor: color }]} /><Text style={styles.tokenMetricLabel}>{label}</Text><Text style={styles.tokenMetricValue}>{value.toLocaleString()}</Text></View>;
}

function SandboxAuthorizationModal({ visible, command, onApprove, onReject, onClose }: { visible: boolean; command?: SandboxCommand; onApprove: () => void; onReject: () => void; onClose: () => void }) {
  if (!command) return null;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>模型请求沙盒命令</Text><Text style={styles.sheetSub}>该命令只会在应用内的虚拟工作区执行，不访问设备系统、网络、文件或密钥。</Text></View><Pressable onPress={onClose} style={styles.closeButton}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable></View><View style={styles.terminalRequest}><View style={styles.terminalRequestIcon}><MaterialIcons name="terminal" size={19} color={COLORS.amber} /></View><Text selectable style={styles.terminalCommand}>$ {command.command}</Text></View><Text style={styles.reasonLabel}>模型说明</Text><Text style={styles.reasonText}>{command.reason}</Text><View style={styles.sandboxLimit}><MaterialIcons name="shield" size={16} color={COLORS.mint} /><Text style={styles.sandboxLimitText}>仅允许 help、pwd、ls、cat、echo、grep、date；管道、重定向、写入、网络和系统命令均会拦截。</Text></View><PrimaryButton label="允许本次执行" icon="play-arrow" onPress={onApprove} /><Pressable onPress={onReject} style={styles.rejectCommandButton}><Text style={styles.rejectCommandText}>拒绝执行</Text></Pressable></View></View></Modal>;
}

function RunCard({ run }: { run: AgentRun }) {
  const statusTone = run.status === "completed" ? "success" : "info";
  const statusText = run.status === "completed" ? "已完成" : "执行中";

  return (
    <Card style={styles.runCard}>
      <View style={styles.runTopRow}>
        <View style={styles.runTopText}>
          <Text style={styles.runPrompt}>{run.prompt}</Text>
          <Text style={styles.runMeta}>{run.modelLabel} · ••••{run.keySuffix}</Text>
        </View>
        <Badge label={statusText} tone={statusTone} />
      </View>
      <FlatList
        data={run.steps}
        scrollEnabled={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.steps}
        renderItem={({ item }) => {
          const color = item.state === "warning" ? COLORS.amber : item.state === "running" ? COLORS.blue : COLORS.mint;
          const icon = item.state === "warning" ? "swap-horiz" : item.state === "running" ? "more-horiz" : "check";
          return (
            <View style={styles.stepRow}>
              <View style={[styles.stepIcon, { borderColor: color }]}><MaterialIcons name={icon} size={15} color={color} /></View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{item.title}</Text>
                <Text style={styles.stepDetail}>{item.detail}</Text>
              </View>
            </View>
          );
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 32 },
  titleRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  titleText: { flex: 1, paddingRight: 12 },
  titleActions: { flexDirection: "row", gap: 8 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 310 },
  settingsButton: { alignItems: "center", backgroundColor: "#163D3C", borderColor: "#28756E", borderRadius: 13, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  terminalButton: { alignItems: "center", backgroundColor: "#382C16", borderColor: "#8A6725", borderRadius: 13, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  composerCard: { marginBottom: 25, marginTop: 18 },
  modelRow: { alignItems: "center", flexDirection: "row", marginBottom: 14 },
  modelMark: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 12, height: 38, justifyContent: "center", marginRight: 10, width: 38 },
  modelInfo: { flex: 1 },
  modelCaption: { color: COLORS.muted, fontSize: 11 },
  modelTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800", marginTop: 2 },
  modelPickerLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700", marginBottom: 7 },
  modelPicker: { gap: 8, marginBottom: 13 },
  modelOption: { alignItems: "center", backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 5, paddingHorizontal: 10, paddingVertical: 8 },
  modelOptionSelected: { backgroundColor: "#153B38", borderColor: COLORS.mint },
  modelOptionText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  modelOptionTextSelected: { color: COLORS.mint },
  input: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 14, borderWidth: 1, color: COLORS.text, fontSize: 14, lineHeight: 20, minHeight: 104, padding: 13 },
  helper: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginBottom: 13, marginTop: 8 },
  historyTitleRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  historyTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  historySub: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  clearButton: { borderColor: COLORS.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  clearText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  emptyCard: { alignItems: "center", paddingHorizontal: 22, paddingVertical: 26 },
  emptyTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginTop: 9 },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: "center" },
  runCard: { marginBottom: 12 },
  runTopRow: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  runTopText: { flex: 1 },
  runPrompt: { color: COLORS.text, fontSize: 14, fontWeight: "800", lineHeight: 20 },
  runMeta: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  steps: { borderTopColor: COLORS.border, borderTopWidth: 1, gap: 11, marginTop: 13, paddingTop: 13 },
  stepRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  stepIcon: { alignItems: "center", backgroundColor: "#0B1B27", borderRadius: 99, borderWidth: 1, height: 26, justifyContent: "center", width: 26 },
  stepText: { flex: 1 },
  stepTitle: { color: COLORS.text, fontSize: 12, fontWeight: "700" },
  stepDetail: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  overlay: { backgroundColor: "#00000099", flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 28 },
  handle: { alignSelf: "center", backgroundColor: "#557184", borderRadius: 99, height: 4, marginBottom: 17, width: 42 },
  sheetHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 17 },
  sheetTitle: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  sheetSub: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 275 },
  closeButton: { alignItems: "center", backgroundColor: "#1A3344", borderRadius: 99, height: 34, justifyContent: "center", width: 34 },
  totalCard: { backgroundColor: "#102C36", borderColor: "#28756E", marginBottom: 12, paddingVertical: 18 },
  usageComparison: { alignItems: "center", flexDirection: "row", justifyContent: "center" },
  usageTotal: { alignItems: "center", flex: 1 },
  usageDivider: { backgroundColor: "#28756E", height: 46, width: 1 },
  totalValue: { color: COLORS.mint, fontSize: 31, fontWeight: "800", letterSpacing: -1 },
  totalLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700", marginTop: 3 },
  runName: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginTop: 11, textAlign: "center" },
  tokenRow: { flexDirection: "row", gap: 10, marginBottom: 13 },
  tokenMetric: { alignItems: "center", backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 13, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, padding: 12 },
  tokenDot: { borderRadius: 99, height: 7, width: 7 },
  tokenMetricLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  tokenMetricValue: { color: COLORS.text, flex: 1, fontSize: 15, fontWeight: "800", textAlign: "right" },
  usageUnavailable: { alignItems: "center", backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 13, padding: 12 },
  usageUnavailableText: { color: COLORS.muted, flex: 1, fontSize: 11, lineHeight: 16 },
  terminalRequest: { alignItems: "center", backgroundColor: "#0A1A26", borderColor: "#8A6725", borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 10, marginBottom: 14, padding: 13 },
  terminalRequestIcon: { alignItems: "center", backgroundColor: "#382C16", borderRadius: 8, height: 30, justifyContent: "center", width: 30 },
  terminalCommand: { color: COLORS.text, flex: 1, fontFamily: "monospace", fontSize: 13, fontWeight: "700" },
  reasonLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "800", marginBottom: 4 },
  reasonText: { color: COLORS.text, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  sandboxLimit: { alignItems: "flex-start", backgroundColor: "#102C36", borderColor: "#28756E", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 14, padding: 11 },
  sandboxLimitText: { color: COLORS.muted, flex: 1, fontSize: 11, lineHeight: 16 },
  rejectCommandButton: { alignItems: "center", marginTop: 12, paddingVertical: 8 },
  rejectCommandText: { color: "#FF6D6D", fontSize: 13, fontWeight: "800" },
  statsNote: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginBottom: 14, marginTop: 1 },
  emptyStats: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 13 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
