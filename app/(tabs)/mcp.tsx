import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { Badge, Card, COLORS, PrimaryButton } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAgentState, type McpServer, type McpTool } from "@/lib/agent-state";
import { summarizeToolArguments, type McpTransport } from "@/lib/mcp-logic";

export default function McpScreen() {
  const { mcpServers, mcpTools, mcpCalls, addMcpServer, removeMcpServer, testMcpServer, toggleMcpTool, callMcpTool } = useAgentState();
  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [toolModal, setToolModal] = useState<McpTool | null>(null);
  const [authorizationTool, setAuthorizationTool] = useState<McpTool | null>(null);
  const [authorizationSummary, setAuthorizationSummary] = useState("");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("http");
  const [endpoint, setEndpoint] = useState("");
  const [messageEndpoint, setMessageEndpoint] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [argumentsText, setArgumentsText] = useState("{}");

  const runningServerIds = useMemo(() => new Set(mcpServers.filter((server) => server.diagnostic?.state === "testing").map((server) => server.id)), [mcpServers]);

  const submitServer = async () => {
    if (!name.trim() || !endpoint.trim() || (transport === "sse" && !messageEndpoint.trim())) {
      Alert.alert("请补全 MCP 配置", transport === "sse" ? "SSE 服务需要服务名称、事件流地址和消息端点。" : "HTTP 服务需要服务名称和 JSON-RPC 端点。");
      return;
    }
    const saved = await addMcpServer({ name, transport, endpoint, messageEndpoint, authToken });
    if (!saved) return;
    setName(""); setEndpoint(""); setMessageEndpoint(""); setAuthToken(""); setTransport("http");
    setServerModalVisible(false);
  };

  const requestAuthorization = () => {
    if (!toolModal) return;
    try {
      setAuthorizationSummary(summarizeToolArguments(argumentsText));
      setAuthorizationTool(toolModal);
      setToolModal(null);
    } catch (error) {
      Alert.alert("参数格式不正确", error instanceof Error ? error.message : "请检查 JSON 参数。" );
    }
  };

  const executeAuthorizedTool = async () => {
    if (!authorizationTool) return;
    await callMcpTool(authorizationTool.id, argumentsText);
    setAuthorizationTool(null);
    setArgumentsText("{}");
  };

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <FlatList
        data={mcpServers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ServerCard
            server={item}
            tools={mcpTools.filter((tool) => tool.serverId === item.id)}
            recentCalls={mcpCalls.filter((call) => call.serverId === item.id).slice(0, 1)}
            testing={runningServerIds.has(item.id)}
            onTest={() => void testMcpServer(item.id)}
            onRemove={() => Alert.alert("移除 MCP 服务", `确定移除“${item.name}”及其已发现工具吗？`, [{ text: "取消", style: "cancel" }, { text: "移除", style: "destructive", onPress: () => void removeMcpServer(item.id) }])}
            onToggleTool={toggleMcpTool}
            onCall={(tool) => { setArgumentsText("{}"); setToolModal(tool); }}
          />
        )}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View style={styles.headerText}><Text style={styles.title}>MCP 工具中心</Text><Text style={styles.subtitle}>连接您自行配置的 HTTP 或 SSE MCP 服务，发现并调用工具。</Text></View>
              <Pressable onPress={() => setServerModalVisible(true)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><MaterialIcons name="add" size={21} color={COLORS.background} /></Pressable>
            </View>
            <Card style={styles.securityCard}>
              <View style={styles.securityIcon}><MaterialIcons name="shield" size={20} color={COLORS.mint} /></View>
              <View style={styles.securityTextWrap}><Text style={styles.securityTitle}>仅连接您添加的服务</Text><Text style={styles.securityText}>认证令牌保存于设备安全存储。请只连接可信的 MCP 地址，应用不会读取个人连接器。</Text></View>
            </Card>
          </View>
        }
        ListEmptyComponent={<Card style={styles.emptyCard}><MaterialIcons name="handyman" size={27} color={COLORS.muted} /><Text style={styles.emptyTitle}>尚未连接 MCP 服务</Text><Text style={styles.emptyText}>点击右上角添加您的 HTTP 或 SSE MCP 服务器，然后执行工具发现。</Text></Card>}
      />
      <ServerModal visible={serverModalVisible} name={name} transport={transport} endpoint={endpoint} messageEndpoint={messageEndpoint} authToken={authToken} onName={setName} onTransport={setTransport} onEndpoint={setEndpoint} onMessageEndpoint={setMessageEndpoint} onAuthToken={setAuthToken} onClose={() => setServerModalVisible(false)} onSave={() => void submitServer()} />
      <ToolModal tool={toolModal} value={argumentsText} onChange={setArgumentsText} onClose={() => setToolModal(null)} onReview={requestAuthorization} />
      <AuthorizationModal tool={authorizationTool} summary={authorizationSummary} onBack={() => { setToolModal(authorizationTool); setAuthorizationTool(null); }} onClose={() => setAuthorizationTool(null)} onAuthorize={() => void executeAuthorizedTool()} />
    </ScreenContainer>
  );
}

function ServerCard({ server, tools, recentCalls, testing, onTest, onRemove, onToggleTool, onCall }: { server: McpServer; tools: McpTool[]; recentCalls: { toolName: string; status: string; summary: string }[]; testing: boolean; onTest: () => void; onRemove: () => void; onToggleTool: (toolId: string) => void; onCall: (tool: McpTool) => void }) {
  const diagnostic = server.diagnostic;
  const tone = diagnostic?.state === "healthy" ? "success" : diagnostic?.state === "error" ? "error" : diagnostic?.state === "testing" ? "warning" : "neutral";
  const label = diagnostic?.state === "healthy" ? "已连接" : diagnostic?.state === "error" ? "连接失败" : diagnostic?.state === "testing" ? "发现中" : "未测试";
  return <Card style={styles.serverCard}>
    <View style={styles.serverTop}>
      <View style={[styles.serverIcon, server.transport === "sse" && styles.sseIcon]}><MaterialIcons name={server.transport === "sse" ? "dynamic-feed" : "hub"} size={22} color={server.transport === "sse" ? COLORS.mint : COLORS.blue} /></View>
      <View style={styles.serverInfo}><Text style={styles.serverName}>{server.name}</Text><Text numberOfLines={1} style={styles.endpoint}>{server.endpoint}</Text></View>
      <Badge label={label} tone={tone} />
    </View>
    <View style={styles.serverMeta}><Badge label={server.transport === "sse" ? "SSE" : "HTTP"} tone="info" /><Text style={styles.metaText}>{server.authSuffix ? `认证令牌 · ••••${server.authSuffix}` : "未配置认证"}</Text></View>
    {diagnostic?.message ? <Text style={[styles.diagnostic, diagnostic.state === "error" && styles.diagnosticError]}>{diagnostic.message}{diagnostic.latencyMs ? ` · ${diagnostic.latencyMs}ms` : ""}</Text> : null}
    <View style={styles.actionRow}>
      <Pressable disabled={testing} onPress={onTest} style={({ pressed }) => [styles.outlineButton, (pressed || testing) && styles.pressed]}><MaterialIcons name="travel-explore" size={17} color={COLORS.mint} /><Text style={styles.outlineText}>{testing ? "发现工具中" : "测试并发现工具"}</Text></Pressable>
      <Pressable onPress={onRemove} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={20} color={COLORS.coral} /></Pressable>
    </View>
    {tools.length ? <View style={styles.toolsBlock}><Text style={styles.blockTitle}>发现的工具 · {tools.length}</Text>{tools.map((tool) => <View key={tool.id} style={styles.toolRow}><View style={styles.toolText}><Text style={styles.toolName}>{tool.name}</Text><Text numberOfLines={2} style={styles.toolDescription}>{tool.description || "服务端未提供工具说明"}</Text>{tool.lastSummary ? <Text numberOfLines={1} style={[styles.toolResult, tool.lastStatus === "error" && styles.diagnosticError]}>{tool.lastSummary}</Text> : null}</View><View style={styles.toolActions}><Pressable onPress={() => onCall(tool)} style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}><MaterialIcons name="play-arrow" size={18} color={COLORS.background} /></Pressable><Switch value={tool.enabled} onValueChange={() => onToggleTool(tool.id)} trackColor={{ false: "#294454", true: "#27796E" }} thumbColor={tool.enabled ? COLORS.mint : "#9AAEBB"} /></View></View>)}</View> : null}
    {recentCalls.map((call) => <View key={`${call.toolName}-${call.summary}`} style={styles.callSummary}><MaterialIcons name={call.status === "success" ? "check-circle" : "error-outline"} size={16} color={call.status === "success" ? COLORS.mint : COLORS.coral} /><Text numberOfLines={1} style={styles.callSummaryText}>{call.toolName} · {call.summary}</Text></View>)}
  </Card>;
}

function ServerModal({ visible, name, transport, endpoint, messageEndpoint, authToken, onName, onTransport, onEndpoint, onMessageEndpoint, onAuthToken, onClose, onSave }: { visible: boolean; name: string; transport: McpTransport; endpoint: string; messageEndpoint: string; authToken: string; onName: (value: string) => void; onTransport: (value: McpTransport) => void; onEndpoint: (value: string) => void; onMessageEndpoint: (value: string) => void; onAuthToken: (value: string) => void; onClose: () => void; onSave: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>添加 MCP 服务</Text><Text style={styles.sheetSub}>支持远程 HTTP JSON-RPC 与 SSE 服务。</Text></View><Pressable onPress={onClose} style={styles.closeButton}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable></View><Text style={styles.fieldLabel}>传输方式</Text><View style={styles.transportRow}>{(["http", "sse"] as McpTransport[]).map((item) => <Pressable key={item} onPress={() => onTransport(item)} style={[styles.transportButton, transport === item && styles.transportButtonActive]}><Text style={[styles.transportText, transport === item && styles.transportTextActive]}>{item === "http" ? "HTTP" : "SSE"}</Text></Pressable>)}</View><Field label="服务名称" value={name} onChangeText={onName} placeholder="例如：团队工具服务" /><Field label={transport === "sse" ? "SSE 事件流地址" : "JSON-RPC 端点"} value={endpoint} onChangeText={onEndpoint} placeholder="https://mcp.example.com" autoCapitalize="none" />{transport === "sse" ? <Field label="消息发送端点" value={messageEndpoint} onChangeText={onMessageEndpoint} placeholder="https://mcp.example.com/message" autoCapitalize="none" /> : null}<Field label="Bearer Token（可选）" value={authToken} onChangeText={onAuthToken} placeholder="仅保存到设备安全存储" autoCapitalize="none" secureTextEntry /><PrimaryButton label="安全保存服务" icon="lock" onPress={onSave} /></View></View></Modal>;
}

function ToolModal({ tool, value, onChange, onClose, onReview }: { tool: McpTool | null; value: string; onChange: (value: string) => void; onClose: () => void; onReview: () => void }) {
  return <Modal visible={Boolean(tool)} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>调用 {tool?.name ?? "工具"}</Text><Text numberOfLines={2} style={styles.sheetSub}>{tool?.description || "请输入符合服务端 Schema 的 JSON 参数。"}</Text></View><Pressable onPress={onClose} style={styles.closeButton}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable></View><Text style={styles.fieldLabel}>JSON 参数</Text><TextInput multiline value={value} onChangeText={onChange} style={[styles.input, styles.argumentsInput]} placeholderTextColor="#7590A0" autoCapitalize="none" autoCorrect={false} textAlignVertical="top" /><Text style={styles.helper}>下一步会显示脱敏参数摘要。确认授权前不会向远程 MCP 服务发送请求。</Text><PrimaryButton label="审阅并授权" icon="verified-user" onPress={onReview} /></View></View></Modal>;
}

function AuthorizationModal({ tool, summary, onBack, onClose, onAuthorize }: { tool: McpTool | null; summary: string; onBack: () => void; onClose: () => void; onAuthorize: () => void }) {
  return <Modal visible={Boolean(tool)} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>确认工具授权</Text><Text style={styles.sheetSub}>仅在您确认后，参数才会发送到所选 MCP 服务。</Text></View><Pressable onPress={onClose} style={styles.closeButton}><MaterialIcons name="close" size={20} color={COLORS.text} /></Pressable></View><View style={styles.securityCard}><View style={styles.securityIcon}><MaterialIcons name="verified-user" size={20} color={COLORS.amber} /></View><View style={styles.securityTextWrap}><Text style={styles.metaText}>即将调用</Text><Text style={styles.serverName}>{tool?.name}</Text></View></View><Text style={styles.fieldLabel}>参数摘要</Text><Text style={[styles.input, { paddingVertical: 12, lineHeight: 20, marginBottom: 8 }]}>{summary}</Text><Text style={styles.helper}>字段名称含 token、secret、password 或 API key 时会自动脱敏显示。请确认本次调用符合您的预期。</Text><PrimaryButton label="确认并调用" icon="play-arrow" onPress={onAuthorize} /><Pressable onPress={onBack} style={({ pressed }) => [styles.outlineButton, { marginTop: 10 }, pressed && styles.pressed]}><Text style={styles.outlineText}>返回修改参数</Text></Pressable></View></View></Modal>;
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} placeholderTextColor="#7590A0" {...props} /></View>; }

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 34 }, headerRow: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, headerText: { flex: 1, paddingRight: 14 }, title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 }, subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 5 }, addButton: { alignItems: "center", backgroundColor: COLORS.mint, borderRadius: 14, height: 46, justifyContent: "center", width: 46 }, securityCard: { alignItems: "center", flexDirection: "row", gap: 11, marginBottom: 16, marginTop: 17 }, securityIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 12, height: 40, justifyContent: "center", width: 40 }, securityTextWrap: { flex: 1 }, securityTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" }, securityText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }, emptyCard: { alignItems: "center", padding: 25 }, emptyTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginTop: 8 }, emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: "center" }, serverCard: { marginBottom: 12 }, serverTop: { alignItems: "center", flexDirection: "row", gap: 10 }, serverIcon: { alignItems: "center", backgroundColor: "#173658", borderRadius: 12, height: 42, justifyContent: "center", width: 42 }, sseIcon: { backgroundColor: "#163D3C" }, serverInfo: { flex: 1 }, serverName: { color: COLORS.text, fontSize: 14, fontWeight: "800" }, endpoint: { color: COLORS.muted, fontSize: 11, marginTop: 4 }, serverMeta: { alignItems: "center", flexDirection: "row", gap: 9, marginTop: 12 }, metaText: { color: COLORS.muted, fontSize: 11 }, diagnostic: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 9 }, diagnosticError: { color: COLORS.coral }, actionRow: { alignItems: "center", borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", gap: 8, marginTop: 13, paddingTop: 12 }, outlineButton: { alignItems: "center", borderColor: "#28756E", borderRadius: 11, borderWidth: 1, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 38 }, outlineText: { color: COLORS.mint, fontSize: 12, fontWeight: "800" }, iconButton: { alignItems: "center", backgroundColor: "#2D2029", borderRadius: 11, height: 38, justifyContent: "center", width: 38 }, toolsBlock: { borderTopColor: COLORS.border, borderTopWidth: 1, marginTop: 13, paddingTop: 12 }, blockTitle: { color: COLORS.text, fontSize: 12, fontWeight: "800", marginBottom: 6 }, toolRow: { alignItems: "center", borderTopColor: "#1C3545", borderTopWidth: 1, flexDirection: "row", gap: 8, paddingVertical: 10 }, toolText: { flex: 1 }, toolName: { color: COLORS.text, fontSize: 12, fontWeight: "800" }, toolDescription: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 2 }, toolResult: { color: COLORS.mint, fontSize: 10, marginTop: 4 }, toolActions: { alignItems: "center", flexDirection: "row", gap: 5 }, callButton: { alignItems: "center", backgroundColor: COLORS.mint, borderRadius: 9, height: 30, justifyContent: "center", width: 30 }, callSummary: { alignItems: "center", backgroundColor: "#0B1B27", borderRadius: 10, flexDirection: "row", gap: 7, marginTop: 3, paddingHorizontal: 9, paddingVertical: 8 }, callSummaryText: { color: COLORS.muted, flex: 1, fontSize: 10 }, overlay: { backgroundColor: "#00000099", flex: 1, justifyContent: "flex-end" }, sheet: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 28 }, handle: { alignSelf: "center", backgroundColor: "#557184", borderRadius: 99, height: 4, marginBottom: 17, width: 42 }, sheetHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 17 }, sheetTitle: { color: COLORS.text, fontSize: 19, fontWeight: "800" }, sheetSub: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 280 }, closeButton: { alignItems: "center", backgroundColor: "#1A3344", borderRadius: 99, height: 34, justifyContent: "center", width: 34 }, field: { marginBottom: 13 }, fieldLabel: { color: COLORS.text, fontSize: 12, fontWeight: "700", marginBottom: 7 }, input: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, color: COLORS.text, fontSize: 14, minHeight: 47, paddingHorizontal: 12 }, transportRow: { flexDirection: "row", gap: 9, marginBottom: 15 }, transportButton: { backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 11, borderWidth: 1, flex: 1, paddingVertical: 10 }, transportButtonActive: { backgroundColor: "#163D3C", borderColor: COLORS.mint }, transportText: { color: COLORS.muted, fontSize: 12, fontWeight: "800", textAlign: "center" }, transportTextActive: { color: COLORS.mint }, argumentsInput: { minHeight: 128, paddingTop: 12 }, helper: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginBottom: 13, marginTop: 7 }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
