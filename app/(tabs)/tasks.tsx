import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Badge, Card, COLORS, PrimaryButton } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAgentState, type AgentRun } from "@/lib/agent-state";

export default function TasksScreen() {
  const { defaultModel, runs, runAgent, clearRuns } = useAgentState();
  const [prompt, setPrompt] = useState("分析当前 API 密钥池，并给出稳定性摘要");
  const running = useMemo(() => runs.some((run) => run.status === "running"), [runs]);

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
            <Text style={styles.title}>代理任务</Text>
            <Text style={styles.subtitle}>在本地演示模式中规划、路由并记录执行步骤。</Text>

            <Card style={styles.composerCard}>
              <View style={styles.modelRow}>
                <View style={styles.modelMark}><MaterialIcons name="psychology" size={19} color={COLORS.mint} /></View>
                <View style={styles.modelInfo}>
                  <Text style={styles.modelCaption}>本次默认模型</Text>
                  <Text style={styles.modelTitle}>{defaultModel?.label ?? "请先添加模型"}</Text>
                </View>
                <Badge label="本地演示" tone="info" />
              </View>
              <TextInput
                multiline
                value={prompt}
                onChangeText={setPrompt}
                placeholder="描述希望代理完成的任务…"
                placeholderTextColor="#7590A0"
                textAlignVertical="top"
                style={styles.input}
              />
              <Text style={styles.helper}>输入“备用”或“故障”可模拟主密钥失败后的自动切换。</Text>
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
    </ScreenContainer>
  );
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
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 310 },
  composerCard: { marginBottom: 25, marginTop: 18 },
  modelRow: { alignItems: "center", flexDirection: "row", marginBottom: 14 },
  modelMark: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 12, height: 38, justifyContent: "center", marginRight: 10, width: 38 },
  modelInfo: { flex: 1 },
  modelCaption: { color: COLORS.muted, fontSize: 11 },
  modelTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800", marginTop: 2 },
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
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
