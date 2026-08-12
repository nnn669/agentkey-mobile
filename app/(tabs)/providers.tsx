import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { Badge, Card, COLORS, PrimaryButton } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAgentState, type ApiProvider } from "@/lib/agent-state";

const TRACK_COLORS = { false: "#294454", true: "#27796E" };

export default function ProvidersScreen() {
  const { providers, addProvider, removeProvider, toggleProvider } = useAgentState();
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");

  const submit = () => {
    if (!name.trim() || !baseUrl.trim() || !model.trim()) {
      Alert.alert("请补全配置", "供应商名称、基础 URL 和默认模型均为必填项。");
      return;
    }
    addProvider(name, baseUrl, model);
    setName("");
    setBaseUrl("");
    setModel("");
    setModalVisible(false);
  };

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <FlatList
        data={providers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProviderCard item={item} onToggle={() => toggleProvider(item.id)} onRemove={() => {
          Alert.alert("移除 API 供应商", `确定移除“${item.name}”及其密钥池吗？`, [
            { text: "取消", style: "cancel" },
            { text: "移除", style: "destructive", onPress: () => removeProvider(item.id) },
          ]);
        }} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>API 供应商</Text>
                <Text style={styles.subtitle}>管理模型 API 的基础地址、协议和启用状态。</Text>
              </View>
              <Pressable onPress={() => setModalVisible(true)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                <MaterialIcons name="add" size={21} color={COLORS.background} />
              </Pressable>
            </View>
            <Card style={styles.notice}>
              <MaterialIcons name="security" size={20} color={COLORS.mint} />
              <Text style={styles.noticeText}>此原型不会请求这些地址。真实调用前，请选择设备直连或自有安全代理层。</Text>
            </Card>
          </View>
        }
        ListEmptyComponent={<Card><Text style={styles.emptyText}>尚未添加 API 供应商。点击右上角添加第一个兼容接口。</Text></Card>}
      />
      <ProviderModal
        visible={modalVisible}
        name={name}
        baseUrl={baseUrl}
        model={model}
        onChangeName={setName}
        onChangeBaseUrl={setBaseUrl}
        onChangeModel={setModel}
        onClose={() => setModalVisible(false)}
        onSubmit={submit}
      />
    </ScreenContainer>
  );
}

function ProviderCard({ item, onToggle, onRemove }: { item: ApiProvider; onToggle: () => void; onRemove: () => void }) {
  return (
    <Card style={styles.providerCard}>
      <View style={styles.cardTop}>
        <View style={styles.providerIcon}><MaterialIcons name="dns" size={22} color={COLORS.blue} /></View>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.providerName}>{item.name}</Text>
          <Text numberOfLines={1} style={styles.baseUrl}>{item.baseUrl}</Text>
        </View>
        <Switch value={item.enabled} onValueChange={onToggle} trackColor={TRACK_COLORS} thumbColor={item.enabled ? COLORS.mint : "#9AAEBB"} />
      </View>
      <View style={styles.cardFooter}>
        <Badge label={item.protocol} tone="info" />
        <Text style={styles.modelCount}>{item.models.length} 个模型</Text>
        <Pressable onPress={onRemove} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={19} color={COLORS.coral} /></Pressable>
      </View>
    </Card>
  );
}

function ProviderModal({ visible, name, baseUrl, model, onChangeName, onChangeBaseUrl, onChangeModel, onClose, onSubmit }: { visible: boolean; name: string; baseUrl: string; model: string; onChangeName: (value: string) => void; onChangeBaseUrl: (value: string) => void; onChangeModel: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View><Text style={styles.sheetTitle}>添加 API 供应商</Text><Text style={styles.sheetSub}>创建一个 OpenAI 兼容的模型入口。</Text></View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable>
          </View>
          <Field label="显示名称" value={name} onChangeText={onChangeName} placeholder="例如：团队网关" />
          <Field label="基础 URL" value={baseUrl} onChangeText={onChangeBaseUrl} placeholder="https://api.example.com/v1" autoCapitalize="none" />
          <Field label="默认模型" value={model} onChangeText={onChangeModel} placeholder="例如：reasoning-v1" autoCapitalize="none" />
          <PrimaryButton label="保存供应商" icon="check" onPress={onSubmit} />
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
  notice: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 16, marginTop: 17 },
  noticeText: { color: COLORS.muted, flex: 1, fontSize: 12, lineHeight: 17 },
  providerCard: { marginBottom: 12 },
  cardTop: { alignItems: "center", flexDirection: "row", gap: 10 },
  providerIcon: { alignItems: "center", backgroundColor: "#173658", borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  cardTitleWrap: { flex: 1 },
  providerName: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  baseUrl: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  cardFooter: { alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", gap: 9, marginTop: 14, paddingTop: 12 },
  modelCount: { color: COLORS.muted, flex: 1, fontSize: 12 },
  removeButton: { alignItems: "center", height: 30, justifyContent: "center", width: 30 },
  emptyText: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  modalOverlay: { backgroundColor: "#00000099", flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 28 },
  sheetHandle: { alignSelf: "center", backgroundColor: "#557184", borderRadius: 99, height: 4, marginBottom: 17, width: 42 },
  sheetHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  sheetTitle: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  sheetSub: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  closeButton: { alignItems: "center", backgroundColor: "#1A3344", borderRadius: 99, height: 34, justifyContent: "center", width: 34 },
  field: { marginBottom: 14 },
  fieldLabel: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginBottom: 7 },
  input: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, color: COLORS.text, fontSize: 14, minHeight: 47, paddingHorizontal: 12 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
