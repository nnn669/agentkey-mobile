import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useState, type ComponentProps } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { Badge, Card, COLORS, PrimaryButton } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { getStrategyLabel, useAgentState, type ApiProvider, type ConnectionTestMode, type KeyEntry, type ModelProfile } from "@/lib/agent-state";
import type { RoutingStrategy } from "@/lib/agent-logic";

const TRACK_COLORS = { false: "#294454", true: "#27796E" };

export default function ProvidersScreen() {
  const router = useRouter();
  const { providers, keys, addModel, addProvider, removeModel, removeProvider, testProvider, toggleProvider, updateModelRouting } = useAgentState();
  const [providerModalVisible, setProviderModalVisible] = useState(false);
  const [modelModalProviderId, setModelModalProviderId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelLabel, setModelLabel] = useState("");

  const submitProvider = () => {
    if (!name.trim() || !baseUrl.trim() || !modelLabel.trim()) {
      Alert.alert("请补全配置", "供应商名称、基础 URL 和初始模型均为必填项。");
      return;
    }
    addProvider(name, baseUrl, modelLabel);
    setName("");
    setBaseUrl("");
    setModelLabel("");
    setProviderModalVisible(false);
  };

  const submitModel = () => {
    if (!modelModalProviderId || !modelLabel.trim()) {
      Alert.alert("请输入模型名称", "模型名称将建立独立的多 Key 路由池。");
      return;
    }
    addModel(modelModalProviderId, modelLabel);
    setModelLabel("");
    setModelModalProviderId(null);
  };

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <FlatList
        data={providers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProviderCard
            item={item}
            keys={keys}
            onAddModel={() => setModelModalProviderId(item.id)}
            onChangeStrategy={(modelId, strategy) => updateModelRouting(modelId, strategy)}
            onManageKeys={(modelId) => router.push({ pathname: "/keys", params: { modelId } })}
            onRemove={() => Alert.alert("移除 API 供应商", `确定移除“${item.name}”及其全部模型和密钥吗？`, [
              { text: "取消", style: "cancel" },
              { text: "移除", style: "destructive", onPress: () => removeProvider(item.id) },
            ])}
            onRemoveModel={(target) => Alert.alert("移除模型", `确定移除“${target.label}”及其全部密钥吗？`, [
              { text: "取消", style: "cancel" },
              { text: "移除", style: "destructive", onPress: () => void removeModel(target.id) },
            ])}
            onTest={(mode, modelId) => void testProvider(item.id, mode, modelId)}
            onToggle={() => toggleProvider(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View><View style={styles.headerRow}><View style={styles.headerText}><Text style={styles.title}>API 供应商</Text><Text style={styles.subtitle}>一个 API 可管理多个模型；每个模型拥有独立多 Key 池与轮询游标。</Text></View><Pressable onPress={() => setProviderModalVisible(true)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><MaterialIcons name="add" size={21} color={COLORS.background} /></Pressable></View><Card style={styles.notice}><MaterialIcons name="security" size={20} color={COLORS.mint} /><Text style={styles.noticeText}>真实直连仅由您主动触发。所有 Key 只以尾号呈现，且每个模型独立计算健康状态与冷却。</Text></Card></View>}
        ListEmptyComponent={<Card><Text style={styles.emptyText}>尚未添加 API 供应商。点击右上角添加第一个兼容接口。</Text></Card>}
      />
      <ProviderModal visible={providerModalVisible} name={name} baseUrl={baseUrl} model={modelLabel} onChangeName={setName} onChangeBaseUrl={setBaseUrl} onChangeModel={setModelLabel} onClose={() => setProviderModalVisible(false)} onSubmit={submitProvider} />
      <ModelModal visible={Boolean(modelModalProviderId)} value={modelLabel} onChange={setModelLabel} onClose={() => setModelModalProviderId(null)} onSubmit={submitModel} />
    </ScreenContainer>
  );
}

function ProviderCard({ item, keys, onAddModel, onChangeStrategy, onManageKeys, onRemove, onRemoveModel, onTest, onToggle }: { item: ApiProvider; keys: KeyEntry[]; onAddModel: () => void; onChangeStrategy: (modelId: string, strategy: RoutingStrategy) => void; onManageKeys: (modelId: string) => void; onRemove: () => void; onRemoveModel: (model: ModelProfile) => void; onTest: (mode: ConnectionTestMode, modelId?: string) => void; onToggle: () => void }) {
  const diagnostic = item.diagnostic;
  const tone = diagnostic?.state === "healthy" ? "success" : diagnostic?.state === "error" ? "error" : diagnostic?.state === "testing" ? "warning" : "neutral";
  return <Card style={styles.providerCard}>
    <View style={styles.cardTop}><View style={styles.providerIcon}><MaterialIcons name="dns" size={22} color={COLORS.blue} /></View><View style={styles.cardTitleWrap}><Text style={styles.providerName}>{item.name}</Text><Text numberOfLines={1} style={styles.baseUrl}>{item.baseUrl}</Text></View><Switch value={item.enabled} onValueChange={onToggle} trackColor={TRACK_COLORS} thumbColor={item.enabled ? COLORS.mint : "#9AAEBB"} /></View>
    <View style={styles.cardFooter}><Badge label={item.protocol} tone="info" /><Text style={styles.modelCount}>{item.models.length} 个模型 · {keys.filter((key) => item.models.some((model) => model.id === key.modelProfileId)).length} 个 Key</Text><Pressable onPress={onRemove} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={19} color={COLORS.coral} /></Pressable></View>
    <View style={styles.modelsHeader}><Text style={styles.modelsTitle}>模型与独立密钥池</Text><Pressable onPress={onAddModel} style={({ pressed }) => [styles.modelAddButton, pressed && styles.pressed]}><MaterialIcons name="add" size={16} color={COLORS.mint} /><Text style={styles.modelAddText}>添加模型</Text></Pressable></View>
    <View style={styles.modelsStack}>{item.models.map((model) => <ModelRow key={model.id} model={model} keyCount={keys.filter((key) => key.modelProfileId === model.id).length} onManage={() => onManageKeys(model.id)} onRemove={() => onRemoveModel(model)} onTest={() => onTest("simulated", model.id)} onChangeStrategy={(strategy) => onChangeStrategy(model.id, strategy)} />)}</View>
    {diagnostic ? <View style={styles.diagnosticRow}><MaterialIcons name={diagnostic.state === "healthy" ? "check-circle" : diagnostic.state === "error" ? "error-outline" : "sync"} size={17} color={diagnostic.state === "healthy" ? COLORS.mint : diagnostic.state === "error" ? COLORS.coral : COLORS.amber} /><View style={styles.diagnosticText}><Text style={styles.diagnosticTitle}>{diagnostic.message}</Text><Text style={styles.diagnosticMeta}>{diagnostic.mode === "direct" ? "真实直连" : "模拟诊断"}{diagnostic.statusCode ? ` · HTTP ${diagnostic.statusCode}` : ""}{diagnostic.latencyMs ? ` · ${diagnostic.latencyMs}ms` : ""}</Text></View><Badge label={diagnostic.state === "testing" ? "测试中" : diagnostic.state === "healthy" ? "可连接" : "需处理"} tone={tone} /></View> : null}
    <View style={styles.testRow}><Pressable disabled={diagnostic?.state === "testing"} onPress={() => onTest("simulated")} style={({ pressed }) => [styles.testButton, pressed && styles.pressed, diagnostic?.state === "testing" && styles.testDisabled]}><MaterialIcons name="science" size={17} color={COLORS.mint} /><Text style={styles.testButtonText}>模拟诊断</Text></Pressable><Pressable disabled={diagnostic?.state === "testing"} onPress={() => onTest("direct")} style={({ pressed }) => [styles.testButton, styles.testDirect, pressed && styles.pressed, diagnostic?.state === "testing" && styles.testDisabled]}><MaterialIcons name="wifi-tethering" size={17} color={COLORS.blue} /><Text style={[styles.testButtonText, styles.testDirectText]}>真实直连</Text></Pressable></View>
  </Card>;
}

function ModelRow({ model, keyCount, onManage, onRemove, onTest, onChangeStrategy }: { model: ModelProfile; keyCount: number; onManage: () => void; onRemove: () => void; onTest: () => void; onChangeStrategy: (strategy: RoutingStrategy) => void }) {
  const strategy = model.routingStrategy ?? "roundRobin";
  const nextStrategy: Record<RoutingStrategy, RoutingStrategy> = { priority: "roundRobin", roundRobin: "leastUsed", leastUsed: "priority" };
  return <View style={styles.modelRow}><View style={styles.modelRowIcon}><MaterialIcons name="memory" size={18} color={COLORS.blue} /></View><View style={styles.modelRowBody}><Text style={styles.modelRowName}>{model.label}</Text><Text style={styles.modelRowMeta}>{keyCount} 个 Key · {getStrategyLabel(strategy)}</Text><View style={styles.modelActions}><Pressable onPress={onManage} style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}><Text style={styles.inlineActionText}>管理 Key</Text></Pressable><Pressable onPress={onTest} style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}><Text style={styles.inlineActionText}>测此模型</Text></Pressable><Pressable onPress={() => onChangeStrategy(nextStrategy[strategy])} style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}><Text style={styles.inlineActionText}>切换策略</Text></Pressable></View></View><Pressable onPress={onRemove} style={({ pressed }) => [styles.modelRemove, pressed && styles.pressed]}><MaterialIcons name="close" size={17} color={COLORS.muted} /></Pressable></View>;
}

function ProviderModal({ visible, name, baseUrl, model, onChangeName, onChangeBaseUrl, onChangeModel, onClose, onSubmit }: { visible: boolean; name: string; baseUrl: string; model: string; onChangeName: (value: string) => void; onChangeBaseUrl: (value: string) => void; onChangeModel: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.sheet}><SheetHeader title="添加 API 供应商" subtitle="先创建一个初始模型，之后可继续添加多个模型。" onClose={onClose} /><Field label="显示名称" value={name} onChangeText={onChangeName} placeholder="例如：团队网关" /><Field label="基础 URL" value={baseUrl} onChangeText={onChangeBaseUrl} placeholder="https://api.example.com/v1" autoCapitalize="none" /><Field label="初始模型" value={model} onChangeText={onChangeModel} placeholder="例如：reasoning-v1" autoCapitalize="none" /><PrimaryButton label="保存供应商" icon="check" onPress={onSubmit} /></View></View></Modal>;
}

function ModelModal({ visible, value, onChange, onClose, onSubmit }: { visible: boolean; value: string; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.sheet}><SheetHeader title="添加模型" subtitle="新模型会拥有独立的多 Key 池和严格轮询游标。" onClose={onClose} /><Field label="模型名称" value={value} onChangeText={onChange} placeholder="例如：reasoning-v2" autoCapitalize="none" /><PrimaryButton label="添加模型" icon="add" onPress={onSubmit} /></View></View></Modal>;
}

function SheetHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) { return <><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>{title}</Text><Text style={styles.sheetSub}>{subtitle}</Text></View><Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable></View></>; }
function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput placeholderTextColor="#7590A0" style={styles.input} {...props} /></View>; }

const styles = StyleSheet.create({
  listContent: { padding: 18, paddingBottom: 34 }, headerRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, headerText: { flex: 1, paddingRight: 14 }, title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 }, subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 5 }, addButton: { alignItems: "center", backgroundColor: COLORS.mint, borderRadius: 14, height: 46, justifyContent: "center", width: 46 }, notice: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 16, marginTop: 17 }, noticeText: { color: COLORS.muted, flex: 1, fontSize: 12, lineHeight: 17 }, providerCard: { marginBottom: 12 }, cardTop: { alignItems: "center", flexDirection: "row", gap: 10 }, providerIcon: { alignItems: "center", backgroundColor: "#173658", borderRadius: 12, height: 42, justifyContent: "center", width: 42 }, cardTitleWrap: { flex: 1 }, providerName: { color: COLORS.text, fontSize: 15, fontWeight: "800" }, baseUrl: { color: COLORS.muted, fontSize: 11, marginTop: 4 }, cardFooter: { alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", gap: 9, marginTop: 14, paddingTop: 12 }, modelCount: { color: COLORS.muted, flex: 1, fontSize: 11 }, removeButton: { alignItems: "center", height: 30, justifyContent: "center", width: 30 }, modelsHeader: { alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 13, paddingTop: 12 }, modelsTitle: { color: COLORS.text, fontSize: 12, fontWeight: "800" }, modelAddButton: { alignItems: "center", flexDirection: "row", gap: 3, paddingVertical: 4 }, modelAddText: { color: COLORS.mint, fontSize: 11, fontWeight: "800" }, modelsStack: { gap: 8, marginTop: 10 }, modelRow: { alignItems: "flex-start", backgroundColor: "#0B1B27", borderColor: COLORS.border, borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 9, padding: 10 }, modelRowIcon: { alignItems: "center", backgroundColor: "#173658", borderRadius: 9, height: 32, justifyContent: "center", width: 32 }, modelRowBody: { flex: 1 }, modelRowName: { color: COLORS.text, fontSize: 12, fontWeight: "800" }, modelRowMeta: { color: COLORS.muted, fontSize: 10, marginTop: 2 }, modelActions: { flexDirection: "row", gap: 8, marginTop: 7 }, inlineAction: { backgroundColor: "#153B38", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 }, inlineActionText: { color: COLORS.mint, fontSize: 10, fontWeight: "800" }, modelRemove: { alignItems: "center", height: 28, justifyContent: "center", width: 24 }, diagnosticRow: { alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 12 }, diagnosticText: { flex: 1 }, diagnosticTitle: { color: COLORS.text, fontSize: 11, fontWeight: "700" }, diagnosticMeta: { color: COLORS.muted, fontSize: 10, marginTop: 2 }, testRow: { flexDirection: "row", gap: 9, marginTop: 13 }, testButton: { alignItems: "center", backgroundColor: "#153B38", borderColor: "#28756E", borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 38 }, testDirect: { backgroundColor: "#173658", borderColor: "#315C91" }, testButtonText: { color: COLORS.mint, fontSize: 11, fontWeight: "800" }, testDirectText: { color: COLORS.blue }, testDisabled: { opacity: 0.48 }, emptyText: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: "center" }, modalOverlay: { backgroundColor: "#00000099", flex: 1, justifyContent: "flex-end" }, sheet: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 28 }, sheetHandle: { alignSelf: "center", backgroundColor: "#557184", borderRadius: 99, height: 4, marginBottom: 17, width: 42 }, sheetHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 20 }, sheetTitle: { color: COLORS.text, fontSize: 19, fontWeight: "800" }, sheetSub: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 260 }, closeButton: { alignItems: "center", backgroundColor: "#1A3344", borderRadius: 99, height: 34, justifyContent: "center", width: 34 }, field: { marginBottom: 14 }, fieldLabel: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginBottom: 7 }, input: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, color: COLORS.text, fontSize: 14, minHeight: 47, paddingHorizontal: 12 }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
