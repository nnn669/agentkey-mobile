import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { Badge, Card, COLORS, PrimaryButton } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { type AgentSkill, type SkillImportMode, useAgentState } from "@/lib/agent-state";
import { createSkillPackage, parseSkillPackage, type SkillPackage } from "@/lib/skill-logic";

export default function SkillsScreen() {
  const { skills, addSkill, importSkills, removeSkill, toggleSkill, mcpServers, mcpTools } = useAgentState();
  const [editorVisible, setEditorVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [pendingPackage, setPendingPackage] = useState<SkillPackage | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("任务能力");
  const [keywords, setKeywords] = useState("");
  const [instructions, setInstructions] = useState("");
  const enabledTools = useMemo(() => mcpTools.filter((tool) => tool.enabled && mcpServers.some((server) => server.id === tool.serverId && server.enabled)).length, [mcpServers, mcpTools]);

  const save = () => {
    if (!name.trim() || !description.trim()) {
      Alert.alert("请填写技能", "技能名称和说明均为必填项。");
      return;
    }
    addSkill({ name, description, category, keywords: keywords.split(/[，,]/), instructions });
    setName("");
    setDescription("");
    setCategory("任务能力");
    setKeywords("");
    setInstructions("");
    setEditorVisible(false);
  };

  const exportPackage = async () => {
    const packageData = createSkillPackage(skills);
    if (!packageData.skills.length) {
      Alert.alert("没有可导出的技能", "仅会导出自定义技能。请先创建至少一项自定义技能后再分享。");
      return;
    }

    try {
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) throw new Error("设备临时目录不可用。");
      const timestamp = packageData.exportedAt.replace(/[:.]/g, "-");
      const fileUri = `${cacheDirectory}agentkey-skills-${timestamp}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(packageData, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      if (!await Sharing.isAvailableAsync()) throw new Error("当前设备不支持系统分享。");
      await Sharing.shareAsync(fileUri, { dialogTitle: "分享 AgentKey 技能包", mimeType: "application/json", UTI: "public.json" });
    } catch (error) {
      Alert.alert("导出失败", error instanceof Error ? error.message : "无法生成技能包或打开系统分享面板。");
    }
  };

  const choosePackage = async () => {
    try {
      const selected = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true, multiple: false });
      if (selected.canceled) return;
      const file = selected.assets[0];
      if (!file) throw new Error("没有读取到所选文件。");
      const raw = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = parseSkillPackage(raw);
      if (!parsed.ok) {
        Alert.alert("导入失败", parsed.error);
        return;
      }
      setPendingPackage(parsed.data);
      setImportVisible(true);
    } catch (error) {
      Alert.alert("导入失败", error instanceof Error ? error.message : "无法读取所选 JSON 文件。");
    }
  };

  const commitImport = (mode: SkillImportMode) => {
    if (!pendingPackage) return;
    const count = importSkills(pendingPackage.skills, mode);
    const skipped = pendingPackage.skills.length - count;
    setPendingPackage(null);
    setImportVisible(false);
    Alert.alert("导入完成", `已${mode === "replace" ? "替换并恢复" : "合并"} ${count} 项自定义技能。${skipped ? ` 已跳过 ${skipped} 项同名技能。` : ""}`);
  };

  const confirmReplace = () => {
    Alert.alert("覆盖自定义技能", "覆盖会移除当前设备中的全部自定义技能，再保留内置技能并恢复此技能包；此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      { text: "确认覆盖", style: "destructive", onPress: () => commitImport("replace") },
    ]);
  };

  return <ScreenContainer className="p-0" containerClassName="bg-background"><FlatList data={skills} keyExtractor={(item) => item.id} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} renderItem={({ item }) => <SkillCard item={item} onToggle={() => toggleSkill(item.id)} onDelete={() => Alert.alert("删除本地技能", `确定删除“${item.name}”吗？`, [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: () => removeSkill(item.id) }])} />} ListHeaderComponent={<View><View style={styles.headerRow}><View style={styles.headerText}><Text style={styles.title}>技能中心</Text><Text style={styles.subtitle}>本地技能用于匹配任务方法与安全约束；它们不等同于 MCP，不会自行获得远程调用权限。</Text></View><View style={styles.headerActions}><Pressable onPress={() => void exportPackage()} style={({ pressed }) => [styles.utilityButton, pressed && styles.pressed]}><MaterialIcons name="ios-share" size={19} color={COLORS.mint} /></Pressable><Pressable onPress={() => void choosePackage()} style={({ pressed }) => [styles.utilityButton, pressed && styles.pressed]}><MaterialIcons name="file-upload" size={19} color={COLORS.blue} /></Pressable><Pressable onPress={() => setEditorVisible(true)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><MaterialIcons name="add" size={21} color={COLORS.background} /></Pressable></View></View><Card style={styles.backupCard}><MaterialIcons name="folder-shared" size={20} color={COLORS.mint} /><Text style={styles.backupText}>导出仅包含自定义技能，不含内置技能、设备标识、任务轨迹、API 密钥或 MCP 认证令牌。导入前会校验 JSON 格式。</Text></Card><Card style={styles.mcpCard}><View style={styles.mcpIcon}><MaterialIcons name="build" size={19} color={COLORS.blue} /></View><View style={styles.mcpText}><Text style={styles.mcpTitle}>与 MCP 工具协同</Text><Text style={styles.mcpBody}>当前有 {enabledTools} 个启用的远程工具。匹配技能只会提示任务策略；MCP 调用仍遵循服务开关与授权确认。</Text></View></Card><View style={styles.summaryRow}><Badge label={`${skills.filter((skill) => skill.enabled).length} 个已启用`} tone="success" /><Badge label={`${skills.filter((skill) => skill.builtIn).length} 个内置`} tone="info" /></View></View>} ListEmptyComponent={<Card style={styles.emptyCard}><MaterialIcons name="auto-awesome" size={27} color={COLORS.muted} /><Text style={styles.emptyTitle}>创建第一项技能</Text><Text style={styles.emptyText}>将任务方法、关键词和安全约束保存为本地技能，供后续任务匹配使用。</Text></Card>} /><SkillModal visible={editorVisible} name={name} description={description} category={category} keywords={keywords} instructions={instructions} onName={setName} onDescription={setDescription} onCategory={setCategory} onKeywords={setKeywords} onInstructions={setInstructions} onClose={() => setEditorVisible(false)} onSave={save} /><SkillImportModal visible={importVisible} packageData={pendingPackage} onClose={() => { setPendingPackage(null); setImportVisible(false); }} onMerge={() => commitImport("merge")} onReplace={confirmReplace} /></ScreenContainer>;
}

function SkillCard({ item, onToggle, onDelete }: { item: AgentSkill; onToggle: () => void; onDelete: () => void }) {
  return <Card style={[styles.skillCard, !item.enabled && styles.disabledCard]}><View style={styles.skillTop}><View style={styles.skillIcon}><MaterialIcons name={item.category === "安全执行" ? "verified-user" : "auto-awesome"} size={21} color={item.enabled ? COLORS.mint : COLORS.muted} /></View><View style={styles.skillText}><Text style={styles.skillName}>{item.name}</Text><Text numberOfLines={2} style={styles.skillDescription}>{item.description}</Text></View><Switch value={item.enabled} onValueChange={onToggle} trackColor={{ false: "#294454", true: "#27796E" }} thumbColor={item.enabled ? COLORS.mint : "#9AAEBB"} /></View><View style={styles.keywordRow}>{item.keywords.slice(0, 4).map((keyword) => <View key={keyword} style={styles.keyword}><Text style={styles.keywordText}>{keyword}</Text></View>)}</View>{Boolean(item.instructions) && <Text numberOfLines={2} style={styles.instructions}>{item.instructions}</Text>}<View style={styles.footer}><Badge label={item.category} tone="info" /><Text style={styles.status}>{item.enabled ? "任务可匹配" : "已停用"}</Text>{item.builtIn ? <Text style={styles.builtIn}>内置</Text> : <Pressable onPress={onDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={19} color={COLORS.coral} /></Pressable>}</View></Card>;
}

function SkillModal({ visible, name, description, category, keywords, instructions, onName, onDescription, onCategory, onKeywords, onInstructions, onClose, onSave }: { visible: boolean; name: string; description: string; category: string; keywords: string; instructions: string; onName: (value: string) => void; onDescription: (value: string) => void; onCategory: (value: string) => void; onKeywords: (value: string) => void; onInstructions: (value: string) => void; onClose: () => void; onSave: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>添加本地技能</Text><Text style={styles.sheetSub}>技能只在本机匹配任务，不会安装代码、读取密钥或扩展 MCP 权限。</Text></View><Pressable onPress={onClose} style={styles.closeButton}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable></View><Field label="名称" value={name} onChangeText={onName} placeholder="例如：需求梳理" /><Field label="分类" value={category} onChangeText={onCategory} placeholder="任务能力、安全执行或上下文" /><Field label="关键词（用逗号分隔）" value={keywords} onChangeText={onKeywords} placeholder="需求, 文档, 结构" /><Text style={styles.fieldLabel}>技能说明</Text><TextInput multiline value={description} onChangeText={onDescription} placeholder="说明它适合匹配哪些任务…" placeholderTextColor="#7590A0" textAlignVertical="top" style={[styles.input, styles.shortArea]} /><Text style={styles.fieldLabel}>安全约束或使用指引（可选）</Text><TextInput multiline value={instructions} onChangeText={onInstructions} placeholder="例如：仅提出步骤，不自动执行远程工具…" placeholderTextColor="#7590A0" textAlignVertical="top" style={[styles.input, styles.shortArea]} /><PrimaryButton label="保存本地技能" icon="save" onPress={onSave} /></View></View></Modal>;
}

function SkillImportModal({ visible, packageData, onClose, onMerge, onReplace }: { visible: boolean; packageData: SkillPackage | null; onClose: () => void; onMerge: () => void; onReplace: () => void }) {
  if (!packageData) return null;
  const exportedAt = new Date(packageData.exportedAt).toLocaleString("zh-CN");
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>导入技能包</Text><Text style={styles.sheetSub}>已完成本地格式校验。请选择恢复方式，所有操作仅在当前设备执行。</Text></View><Pressable onPress={onClose} style={styles.closeButton}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable></View><Card style={styles.packageCard}><View style={styles.packageIcon}><MaterialIcons name="description" size={20} color={COLORS.blue} /></View><View style={styles.packageText}><Text style={styles.packageTitle}>{packageData.skills.length} 项待导入的自定义技能</Text><Text style={styles.packageMeta}>导出时间：{exportedAt}</Text></View></Card><Text style={styles.helper}>合并会保留现有技能，并按名称跳过重复项。覆盖会移除当前全部自定义技能，但会保留内置技能。</Text><PrimaryButton label="合并并导入" icon="merge-type" onPress={onMerge} /><Pressable onPress={onReplace} style={({ pressed }) => [styles.replaceButton, pressed && styles.pressed]}><MaterialIcons name="warning-amber" size={18} color={COLORS.coral} /><Text style={styles.replaceText}>覆盖自定义技能</Text></Pressable></View></View></Modal>;
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} placeholderTextColor="#7590A0" {...props} /></View>; }

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 34 }, headerRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, headerText: { flex: 1, paddingRight: 12 }, headerActions: { alignItems: "center", flexDirection: "row", gap: 7 }, title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 }, subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 5 }, addButton: { alignItems: "center", backgroundColor: COLORS.mint, borderRadius: 13, height: 43, justifyContent: "center", width: 43 }, utilityButton: { alignItems: "center", backgroundColor: "#1A3344", borderRadius: 12, height: 40, justifyContent: "center", width: 40 }, backupCard: { alignItems: "flex-start", flexDirection: "row", gap: 10, marginTop: 17 }, backupText: { color: COLORS.muted, flex: 1, fontSize: 12, lineHeight: 18 }, mcpCard: { alignItems: "flex-start", flexDirection: "row", gap: 10, marginTop: 12 }, mcpIcon: { alignItems: "center", backgroundColor: "#173653", borderRadius: 11, height: 38, justifyContent: "center", width: 38 }, mcpText: { flex: 1 }, mcpTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" }, mcpBody: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 4 }, summaryRow: { flexDirection: "row", gap: 8, marginBottom: 15, marginTop: 12 }, emptyCard: { alignItems: "center", padding: 25 }, emptyTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginTop: 8 }, emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: "center" }, skillCard: { marginBottom: 12 }, disabledCard: { opacity: 0.63 }, skillTop: { alignItems: "flex-start", flexDirection: "row", gap: 10 }, skillIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 12, height: 42, justifyContent: "center", width: 42 }, skillText: { flex: 1 }, skillName: { color: COLORS.text, fontSize: 14, fontWeight: "800" }, skillDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 4 }, keywordRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 }, keyword: { backgroundColor: "#16354A", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 }, keywordText: { color: COLORS.blue, fontSize: 10, fontWeight: "700" }, instructions: { color: "#A6C0CA", fontSize: 11, lineHeight: 16, marginTop: 10 }, footer: { alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", gap: 9, marginTop: 12, paddingTop: 10 }, status: { color: COLORS.muted, flex: 1, fontSize: 11 }, builtIn: { color: COLORS.muted, fontSize: 10, fontWeight: "700" }, deleteButton: { alignItems: "center", height: 30, justifyContent: "center", width: 30 }, overlay: { backgroundColor: "#00000099", flex: 1, justifyContent: "flex-end" }, sheet: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 28 }, handle: { alignSelf: "center", backgroundColor: "#557184", borderRadius: 99, height: 4, marginBottom: 17, width: 42 }, sheetHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 15 }, sheetTitle: { color: COLORS.text, fontSize: 19, fontWeight: "800" }, sheetSub: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 275 }, closeButton: { alignItems: "center", backgroundColor: "#1A3344", borderRadius: 99, height: 34, justifyContent: "center", width: 34 }, packageCard: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 14, padding: 13 }, packageIcon: { alignItems: "center", backgroundColor: "#173653", borderRadius: 11, height: 38, justifyContent: "center", width: 38 }, packageText: { flex: 1 }, packageTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" }, packageMeta: { color: COLORS.muted, fontSize: 11, marginTop: 4 }, helper: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginBottom: 13 }, replaceButton: { alignItems: "center", flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 10, paddingVertical: 10 }, replaceText: { color: COLORS.coral, fontSize: 13, fontWeight: "700" }, field: { marginBottom: 12 }, fieldLabel: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginBottom: 7 }, input: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, color: COLORS.text, fontSize: 14, minHeight: 47, paddingHorizontal: 12 }, shortArea: { minHeight: 70, paddingTop: 10 }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
