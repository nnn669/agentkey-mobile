import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Badge, Card, COLORS, PrimaryButton } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { getKeyStatusLabel, useAgentState, type KeyEntry, type ModelProfile } from "@/lib/agent-state";
import { isCooldownActive, remainingCooldownSeconds } from "@/lib/agent-logic";

export default function KeysScreen() {
  const { keys, models, addKey, cycleKeyStatus } = useAgentState();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedModelId && models[0]) setSelectedModelId(models[0].id);
  }, [models, selectedModelId]);

  const selectedModel = useMemo(() => models.find((model) => model.id === selectedModelId), [models, selectedModelId]);

  const submit = async () => {
    if (!selectedModel || !secret.trim()) {
      Alert.alert("无法保存密钥", "请选择模型并输入密钥内容。密钥只会以脱敏尾号显示。");
      return;
    }
    const saved = await addKey(selectedModel.id, label, secret);
    if (saved) {
      setLabel("");
      setSecret("");
      setModalVisible(false);
    }
  };

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <FlatList
        data={keys}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <KeyCard keyEntry={item} model={models.find((model) => model.id === item.modelProfileId)} now={now} onCycle={() => cycleKeyStatus(item.id)} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>模型与密钥池</Text>
                <Text style={styles.subtitle}>同一模型可配置多个密钥，并按策略自动选择可用项。</Text>
              </View>
              <Pressable onPress={() => setModalVisible(true)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                <MaterialIcons name="add" size={21} color={COLORS.background} />
              </Pressable>
            </View>
            <Card style={styles.securityCard}>
              <View style={styles.securityIcon}><MaterialIcons name="lock" size={20} color={COLORS.mint} /></View>
              <View style={styles.securityBody}>
                <Text style={styles.securityTitle}>密钥默认脱敏</Text>
                <Text style={styles.securityText}>原生设备仅保存至系统安全存储；此列表不保留明文内容。</Text>
              </View>
            </Card>
          </View>
        }
        ListEmptyComponent={<Card><Text style={styles.emptyText}>当前没有密钥。添加密钥后即可启用多 Key 路由。</Text></Card>}
      />
      <KeyModal visible={modalVisible} models={models} selectedModelId={selectedModelId} label={label} secret={secret} onSelectModel={setSelectedModelId} onChangeLabel={setLabel} onChangeSecret={setSecret} onClose={() => setModalVisible(false)} onSubmit={() => void submit()} />
    </ScreenContainer>
  );
}

function KeyCard({ keyEntry, model, now, onCycle }: { keyEntry: KeyEntry; model?: ModelProfile; now: number; onCycle: () => void }) {
  const cooling = keyEntry.status === "cooling" && isCooldownActive(keyEntry.cooldownUntil, now);
  const visibleStatus = cooling ? "cooling" : keyEntry.status;
  const tone = visibleStatus === "healthy" ? "success" : visibleStatus === "cooling" ? "warning" : "error";
  const usagePercent = Math.min(100, Math.round((keyEntry.usage / keyEntry.quota) * 100));
  const remaining = remainingCooldownSeconds(keyEntry.cooldownUntil, now);
  return (
    <Card style={styles.keyCard}>
      <View style={styles.keyTop}>
        <View style={styles.keyIcon}><MaterialIcons name="vpn-key" size={21} color={COLORS.blue} /></View>
        <View style={styles.keyTitleWrap}>
          <Text style={styles.keyLabel}>{keyEntry.label}</Text>
          <Text style={styles.keyMeta}>{model?.label ?? "已移除模型"} · ••••{keyEntry.suffix}</Text>
        </View>
        <Badge label={getKeyStatusLabel(visibleStatus)} tone={tone} />
      </View>
      <View style={styles.usageRow}>
        <View style={styles.usageTextWrap}><Text style={styles.usageText}>演示用量 {keyEntry.usage} / {keyEntry.quota}</Text><Text style={styles.priorityText}>优先级 {keyEntry.priority}</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${usagePercent}%`, backgroundColor: visibleStatus === "healthy" ? COLORS.mint : COLORS.amber }]} /></View>
      </View>
      <View style={styles.keyFooter}>
        <Text style={styles.footerHint}>{cooling ? `${keyEntry.cooldownReason ?? "自动冷却"} · ${remaining} 秒后自动恢复` : keyEntry.failureCount ? `连续失败 ${keyEntry.failureCount} 次 · 阈值后自动冷却` : "点击状态可依次切换：可用 → 冷却 → 停用"}</Text>
        <Pressable onPress={onCycle} style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}><MaterialIcons name="sync" size={18} color={COLORS.mint} /></Pressable>
      </View>
    </Card>
  );
}

function KeyModal({ visible, models, selectedModelId, label, secret, onSelectModel, onChangeLabel, onChangeSecret, onClose, onSubmit }: { visible: boolean; models: ModelProfile[]; selectedModelId: string; label: string; secret: string; onSelectModel: (id: string) => void; onChangeLabel: (value: string) => void; onChangeSecret: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View><Text style={styles.sheetTitle}>添加模型密钥</Text><Text style={styles.sheetSub}>明文只用于写入本地安全存储。</Text></View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable>
          </View>
          <Text style={styles.fieldLabel}>目标模型</Text>
          <FlatList data={models} horizontal showsHorizontalScrollIndicator={false} keyExtractor={(item) => item.id} contentContainerStyle={styles.modelOptions} renderItem={({ item }) => <Pressable onPress={() => onSelectModel(item.id)} style={({ pressed }) => [styles.modelOption, selectedModelId === item.id && styles.modelOptionSelected, pressed && styles.pressed]}><Text style={[styles.modelOptionText, selectedModelId === item.id && styles.modelOptionTextSelected]}>{item.label}</Text></Pressable>} />
          <Field label="密钥标签" value={label} onChangeText={onChangeLabel} placeholder="例如：支付账户备用" />
          <Field label="API Key" value={secret} onChangeText={onChangeSecret} placeholder="粘贴你的密钥" autoCapitalize="none" secureTextEntry />
          <PrimaryButton label="安全保存密钥" icon="lock" onPress={onSubmit} />
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput placeholderTextColor="#7590A0" style={styles.input} {...props} /></View>;
}

const styles = StyleSheet.create({
  listContent: { padding: 18, paddingBottom: 34 },
  headerRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  headerText: { flex: 1, paddingRight: 14 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  addButton: { alignItems: "center", backgroundColor: COLORS.mint, borderRadius: 14, height: 46, justifyContent: "center", width: 46 },
  securityCard: { alignItems: "center", flexDirection: "row", gap: 11, marginBottom: 16, marginTop: 17 },
  securityIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 12, height: 39, justifyContent: "center", width: 39 },
  securityBody: { flex: 1 },
  securityTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  securityText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  keyCard: { marginBottom: 12 },
  keyTop: { alignItems: "center", flexDirection: "row", gap: 10 },
  keyIcon: { alignItems: "center", backgroundColor: "#173658", borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  keyTitleWrap: { flex: 1 },
  keyLabel: { color: COLORS.text, fontSize: 14, fontWeight: "800" },
  keyMeta: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  usageRow: { borderTopColor: COLORS.border, borderTopWidth: 1, marginTop: 13, paddingTop: 12 },
  usageTextWrap: { flexDirection: "row", justifyContent: "space-between", marginBottom: 7 },
  usageText: { color: COLORS.muted, fontSize: 11 },
  priorityText: { color: COLORS.muted, fontSize: 11 },
  progressTrack: { backgroundColor: "#0A1A26", borderRadius: 99, height: 7, overflow: "hidden" },
  progressFill: { borderRadius: 99, height: "100%" },
  keyFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 11 },
  footerHint: { color: COLORS.muted, flex: 1, fontSize: 10, lineHeight: 15, paddingRight: 8 },
  stateButton: { alignItems: "center", backgroundColor: "#17363B", borderRadius: 10, height: 31, justifyContent: "center", width: 31 },
  emptyText: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  modalOverlay: { backgroundColor: "#00000099", flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 28 },
  sheetHandle: { alignSelf: "center", backgroundColor: "#557184", borderRadius: 99, height: 4, marginBottom: 17, width: 42 },
  sheetHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  sheetTitle: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  sheetSub: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  closeButton: { alignItems: "center", backgroundColor: "#1A3344", borderRadius: 99, height: 34, justifyContent: "center", width: 34 },
  modelOptions: { gap: 8, marginBottom: 17 },
  modelOption: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  modelOptionSelected: { backgroundColor: "#153D3C", borderColor: COLORS.mint },
  modelOptionText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  modelOptionTextSelected: { color: COLORS.mint },
  field: { marginBottom: 14 },
  fieldLabel: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginBottom: 7 },
  input: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, color: COLORS.text, fontSize: 14, minHeight: 47, paddingHorizontal: 12 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
