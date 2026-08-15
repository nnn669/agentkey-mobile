import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Badge, Card, COLORS, PrimaryButton } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { SANDBOX_ALLOWED_COMMANDS } from "@/lib/sandbox-shell";
import { useAgentState, type SandboxCommand } from "@/lib/agent-state";

export default function SandboxShellScreen() {
  const router = useRouter();
  const { approveSandboxCommand, rejectSandboxCommand, sandboxCommands, sandboxWorkspace } = useAgentState();
  const pending = sandboxCommands.filter((command) => command.status === "pending");

  return <ScreenContainer className="p-0" containerClassName="bg-background"><FlatList
    data={sandboxCommands}
    keyExtractor={(item) => item.id}
    contentContainerStyle={styles.list}
    showsVerticalScrollIndicator={false}
    ListHeaderComponent={<><View style={styles.header}><Pressable accessibilityLabel="返回任务" onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-back" size={20} color={COLORS.text} /></Pressable><View style={styles.headerText}><Text style={styles.title}>受限沙盒终端</Text><Text style={styles.subtitle}>虚拟工作区 · 无系统进程 · 无网络 · 无设备文件访问</Text></View></View><Card style={styles.safetyCard}><View style={styles.safetyIcon}><MaterialIcons name="shield" size={21} color={COLORS.mint} /></View><View style={styles.safetyText}><Text style={styles.safetyTitle}>模型只能提出命令</Text><Text style={styles.safetyBody}>每条命令必须经过你的明确授权。终端只解释白名单只读命令，命令输出与授权结果仅保存在本机。</Text></View></Card><Text style={styles.sectionTitle}>虚拟工作区</Text><Card style={styles.workspaceCard}><View style={styles.cwd}><MaterialIcons name="folder" size={16} color={COLORS.amber} /><Text style={styles.cwdText}>{sandboxWorkspace.cwd}</Text></View>{sandboxWorkspace.files.map((file) => <View key={file.path} style={styles.fileRow}><MaterialIcons name="description" size={16} color={COLORS.muted} /><Text style={styles.fileName}>{file.path}</Text><Text style={styles.fileMeta}>{file.content.length} 字符</Text></View>)}</Card><Text style={styles.sectionTitle}>允许命令</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.commandChips}>{SANDBOX_ALLOWED_COMMANDS.map((command) => <View key={command} style={styles.chip}><Text style={styles.chipText}>{command}</Text></View>)}</ScrollView><Text style={styles.sectionTitle}>执行审计</Text>{pending.length ? <Text style={styles.pendingHint}>有 {pending.length} 条模型请求等待你的审阅。</Text> : null}</>}
    ListEmptyComponent={<Card style={styles.empty}><MaterialIcons name="terminal" size={28} color={COLORS.muted} /><Text style={styles.emptyTitle}>尚无终端请求</Text><Text style={styles.emptyText}>在任务中输入“终端执行: ls”，模型会先请求并等待你授权。</Text></Card>}
    renderItem={({ item }) => <CommandCard command={item} onApprove={() => approveSandboxCommand(item.id)} onReject={() => rejectSandboxCommand(item.id)} />}
  /></ScreenContainer>;
}

function CommandCard({ command, onApprove, onReject }: { command: SandboxCommand; onApprove: () => void; onReject: () => void }) {
  const tone = command.status === "completed" ? "success" : command.status === "pending" ? "warning" : "neutral";
  const label = command.status === "completed" ? "已执行" : command.status === "pending" ? "待审阅" : command.status === "rejected" ? "已拒绝" : "已拦截";
  return <Card style={styles.commandCard}><View style={styles.commandTop}><View style={styles.commandText}><Text style={styles.commandLine}>$ {command.command}</Text><Text style={styles.commandReason}>{command.reason}</Text></View><Badge label={label} tone={tone} /></View>{command.output !== undefined ? <View style={styles.output}><Text selectable style={styles.outputText}>{command.output}</Text></View> : null}{command.status === "pending" ? <View style={styles.actions}><View style={styles.allow}><PrimaryButton label="允许一次" icon="play-arrow" onPress={onApprove} /></View><Pressable onPress={onReject} style={styles.reject}><Text style={styles.rejectText}>拒绝</Text></Pressable></View> : null}</Card>;
}

const styles = StyleSheet.create({
  list: { padding: 18, paddingBottom: 34 },
  header: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 18 },
  back: { alignItems: "center", backgroundColor: "#1A3344", borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
  headerText: { flex: 1 },
  title: { color: COLORS.text, fontSize: 23, fontWeight: "800", letterSpacing: -0.4 },
  subtitle: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  safetyCard: { alignItems: "flex-start", backgroundColor: "#102C36", borderColor: "#28756E", flexDirection: "row", gap: 11, marginBottom: 22 },
  safetyIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  safetyText: { flex: 1 },
  safetyTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  safetyBody: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginBottom: 9, marginTop: 6 },
  workspaceCard: { marginBottom: 16, padding: 0 },
  cwd: { alignItems: "center", backgroundColor: "#382C16", borderBottomColor: "#8A6725", borderBottomWidth: 1, flexDirection: "row", gap: 7, paddingHorizontal: 13, paddingVertical: 10 },
  cwdText: { color: COLORS.amber, fontFamily: "monospace", fontSize: 12, fontWeight: "700" },
  fileRow: { alignItems: "center", borderBottomColor: COLORS.border, borderBottomWidth: 1, flexDirection: "row", gap: 8, paddingHorizontal: 13, paddingVertical: 10 },
  fileName: { color: COLORS.text, flex: 1, fontFamily: "monospace", fontSize: 12 },
  fileMeta: { color: COLORS.muted, fontSize: 10 },
  commandChips: { gap: 8, marginBottom: 20 },
  chip: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  chipText: { color: COLORS.mint, fontFamily: "monospace", fontSize: 11, fontWeight: "800" },
  pendingHint: { color: COLORS.amber, fontSize: 11, fontWeight: "700", marginBottom: 10 },
  empty: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 28 },
  emptyTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginTop: 9 },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: "center" },
  commandCard: { marginBottom: 11 },
  commandTop: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  commandText: { flex: 1 },
  commandLine: { color: COLORS.text, fontFamily: "monospace", fontSize: 13, fontWeight: "800" },
  commandReason: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  output: { backgroundColor: "#07121B", borderColor: COLORS.border, borderRadius: 10, borderWidth: 1, marginTop: 12, padding: 10 },
  outputText: { color: "#B9D6CB", fontFamily: "monospace", fontSize: 11, lineHeight: 16 },
  actions: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 12 },
  allow: { flex: 1 },
  reject: { alignItems: "center", borderColor: COLORS.border, borderRadius: 11, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 12 },
  rejectText: { color: "#FF6D6D", fontSize: 12, fontWeight: "800" },
});
