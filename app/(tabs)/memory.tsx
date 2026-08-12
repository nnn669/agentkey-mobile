import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, type ComponentProps } from "react";
import { Alert, FlatList, Modal, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { Badge, Card, COLORS, PrimaryButton } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAgentState, type MemoryEntry, type MemoryImportMode } from "@/lib/agent-state";

export default function MemoryScreen() {
  const { memories, addMemory, updateMemory, removeMemory, exportMemories, importMemories } = useAgentState();
  const [editorVisible, setEditorVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("偏好");
  const [importText, setImportText] = useState("");

  const save = () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("请填写记忆", "标题和内容均为必填项。");
      return;
    }
    addMemory({ title, content, category });
    setTitle("");
    setContent("");
    setCategory("偏好");
    setEditorVisible(false);
  };

  const exportBackup = async () => {
    try {
      await Share.share({ message: exportMemories(), title: "AgentKey 记忆备份" });
    } catch {
      Alert.alert("导出失败", "无法打开系统分享面板，请稍后重试。");
    }
  };

  const commitImport = (mode: MemoryImportMode) => {
    try {
      const count = importMemories(importText, mode);
      setImportText("");
      setImportVisible(false);
      Alert.alert("导入完成", `已${mode === "replace" ? "替换为" : "合并"} ${count} 条记忆。`);
    } catch (error) {
      Alert.alert("导入失败", error instanceof Error ? error.message : "请检查备份 JSON。" );
    }
  };

  const confirmReplace = () => {
    Alert.alert("替换全部记忆", "替换会移除当前设备中的所有记忆，再导入备份内容；此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      { text: "确认替换", style: "destructive", onPress: () => commitImport("replace") },
    ]);
  };

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <FlatList
        data={memories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MemoryCard
            item={item}
            onToggle={() => updateMemory(item.id, { enabled: !item.enabled })}
            onDelete={() => Alert.alert("删除本地记忆", `确定删除“${item.title}”吗？`, [
              { text: "取消", style: "cancel" },
              { text: "删除", style: "destructive", onPress: () => removeMemory(item.id) },
            ])}
          />
        )}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>本地记忆</Text>
                <Text style={styles.subtitle}>在设备内保存可检索的偏好与上下文，仅将匹配标题写入任务轨迹。</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable onPress={() => void exportBackup()} style={({ pressed }) => [styles.utilityButton, pressed && styles.pressed]}><MaterialIcons name="ios-share" size={19} color={COLORS.mint} /></Pressable>
                <Pressable onPress={() => setImportVisible(true)} style={({ pressed }) => [styles.utilityButton, pressed && styles.pressed]}><MaterialIcons name="file-download" size={19} color={COLORS.blue} /></Pressable>
                <Pressable onPress={() => setEditorVisible(true)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><MaterialIcons name="add" size={21} color={COLORS.background} /></Pressable>
              </View>
            </View>
            <Card style={styles.infoCard}>
              <MaterialIcons name="privacy-tip" size={20} color={COLORS.blue} />
              <Text style={styles.infoText}>导出仅包含脱敏后的记忆内容，不会包含 MCP 服务、认证令牌、API 密钥、运行轨迹或设备标识。</Text>
            </Card>
          </View>
        }
        ListEmptyComponent={<Card style={styles.emptyCard}><MaterialIcons name="psychology" size={27} color={COLORS.muted} /><Text style={styles.emptyTitle}>创建第一条记忆</Text><Text style={styles.emptyText}>保存工作偏好、项目背景或执行约束，使后续任务获得更一致的上下文。</Text></Card>}
      />
      <MemoryModal visible={editorVisible} title={title} content={content} category={category} onTitle={setTitle} onContent={setContent} onCategory={setCategory} onClose={() => setEditorVisible(false)} onSave={save} />
      <ImportModal visible={importVisible} value={importText} onChange={setImportText} onClose={() => { setImportVisible(false); setImportText(""); }} onMerge={() => commitImport("merge")} onReplace={confirmReplace} />
    </ScreenContainer>
  );
}

function MemoryCard({ item, onToggle, onDelete }: { item: MemoryEntry; onToggle: () => void; onDelete: () => void }) {
  return <Card style={[styles.memoryCard, !item.enabled && styles.memoryCardDisabled]}><View style={styles.memoryTop}><View style={styles.memoryIcon}><MaterialIcons name="psychology" size={21} color={item.enabled ? COLORS.mint : COLORS.muted} /></View><View style={styles.memoryText}><Text style={styles.memoryTitle}>{item.title}</Text><Text numberOfLines={3} style={styles.memoryContent}>{item.content}</Text></View><Switch value={item.enabled} onValueChange={onToggle} trackColor={{ false: "#294454", true: "#27796E" }} thumbColor={item.enabled ? COLORS.mint : "#9AAEBB"} /></View><View style={styles.memoryFooter}><Badge label={item.category} tone="info" /><Text style={styles.updatedText}>{item.enabled ? "任务可引用" : "已停用"}</Text><Pressable onPress={onDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={19} color={COLORS.coral} /></Pressable></View></Card>;
}

function MemoryModal({ visible, title, content, category, onTitle, onContent, onCategory, onClose, onSave }: { visible: boolean; title: string; content: string; category: string; onTitle: (value: string) => void; onContent: (value: string) => void; onCategory: (value: string) => void; onClose: () => void; onSave: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.handle} /><SheetHeader title="添加本地记忆" subtitle="此内容仅保存在当前设备。" onClose={onClose} /><Field label="标题" value={title} onChangeText={onTitle} placeholder="例如：项目沟通偏好" /><Field label="分类" value={category} onChangeText={onCategory} placeholder="偏好、项目或安全" /><Text style={styles.fieldLabel}>记忆内容</Text><TextInput multiline value={content} onChangeText={onContent} placeholder="记录在任务中需要长期参考的信息…" placeholderTextColor="#7590A0" textAlignVertical="top" style={[styles.input, styles.contentInput]} /><PrimaryButton label="保存本地记忆" icon="save" onPress={onSave} /></View></View></Modal>;
}

function ImportModal({ visible, value, onChange, onClose, onMerge, onReplace }: { visible: boolean; value: string; onChange: (value: string) => void; onClose: () => void; onMerge: () => void; onReplace: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.handle} /><SheetHeader title="导入记忆备份" subtitle="仅接受 AgentKey 记忆备份 JSON；不会导入服务或密钥配置。" onClose={onClose} /><Text style={styles.fieldLabel}>备份 JSON</Text><TextInput multiline value={value} onChangeText={onChange} placeholder="粘贴从 AgentKey 导出的 JSON…" placeholderTextColor="#7590A0" autoCapitalize="none" autoCorrect={false} textAlignVertical="top" style={[styles.input, styles.importInput]} /><Text style={styles.helper}>“合并”会保留现有记忆；“替换”将清空当前记忆，且需要二次确认。</Text><PrimaryButton label="合并导入" icon="file-upload" onPress={onMerge} /><Pressable onPress={onReplace} style={({ pressed }) => [styles.replaceButton, pressed && styles.pressed]}><MaterialIcons name="warning-amber" size={18} color={COLORS.coral} /><Text style={styles.replaceText}>替换全部记忆</Text></Pressable></View></View></Modal>;
}

function SheetHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return <View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>{title}</Text><Text style={styles.sheetSub}>{subtitle}</Text></View><Pressable onPress={onClose} style={styles.closeButton}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable></View>;
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} placeholderTextColor="#7590A0" {...props} /></View>; }

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 34 },
  headerRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  headerText: { flex: 1, paddingRight: 12 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 7 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  addButton: { alignItems: "center", backgroundColor: COLORS.mint, borderRadius: 13, height: 43, justifyContent: "center", width: 43 },
  utilityButton: { alignItems: "center", backgroundColor: "#1A3344", borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  infoCard: { alignItems: "flex-start", flexDirection: "row", gap: 10, marginBottom: 16, marginTop: 17 },
  infoText: { color: COLORS.muted, flex: 1, fontSize: 12, lineHeight: 18 },
  emptyCard: { alignItems: "center", padding: 25 },
  emptyTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginTop: 8 },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: "center" },
  memoryCard: { marginBottom: 12 },
  memoryCardDisabled: { opacity: 0.66 },
  memoryTop: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  memoryIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  memoryText: { flex: 1 },
  memoryTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  memoryContent: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  memoryFooter: { alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", gap: 9, marginTop: 12, paddingTop: 10 },
  updatedText: { color: COLORS.muted, flex: 1, fontSize: 11 },
  deleteButton: { alignItems: "center", height: 30, justifyContent: "center", width: 30 },
  overlay: { backgroundColor: "#00000099", flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 28 },
  handle: { alignSelf: "center", backgroundColor: "#557184", borderRadius: 99, height: 4, marginBottom: 17, width: 42 },
  sheetHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  sheetTitle: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  sheetSub: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 275 },
  closeButton: { alignItems: "center", backgroundColor: "#1A3344", borderRadius: 99, height: 34, justifyContent: "center", width: 34 },
  field: { marginBottom: 14 },
  fieldLabel: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginBottom: 7 },
  input: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, color: COLORS.text, fontSize: 14, minHeight: 47, paddingHorizontal: 12 },
  contentInput: { minHeight: 116, paddingTop: 12 },
  importInput: { minHeight: 190, paddingTop: 12 },
  helper: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginBottom: 13, marginTop: 7 },
  replaceButton: { alignItems: "center", flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 10, paddingVertical: 10 },
  replaceText: { color: COLORS.coral, fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
