import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Badge, Card, COLORS } from "@/components/agent-ui";
import { ScreenContainer } from "@/components/screen-container";
import { getStrategyLabel, useAgentState } from "@/lib/agent-state";
import type { RoutingStrategy } from "@/lib/agent-logic";

const STRATEGIES: { id: RoutingStrategy; icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; description: string }[] = [
  { id: "priority", icon: "format-list-numbered", title: "优先级优先", description: "优先使用优先级较高且可用的密钥。" },
  { id: "roundRobin", icon: "sync", title: "循环轮询", description: "将用量均衡分配到可用的密钥中。" },
  { id: "leastUsed", icon: "equalizer", title: "最少负载", description: "始终选择当前演示用量最低的密钥。" },
];

export default function RulesScreen() {
  const { defaultModel, keys, rule, updateRule } = useAgentState();

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>调度规则</Text>
        <Text style={styles.subtitle}>为模型配置密钥选择顺序、失败阈值和冷却策略。</Text>

        <Card style={styles.currentCard}>
          <View style={styles.currentTop}>
            <View style={styles.currentIcon}><MaterialIcons name="alt-route" size={24} color={COLORS.mint} /></View>
            <View style={styles.currentText}><Text style={styles.currentLabel}>当前生效规则</Text><Text style={styles.currentValue}>{getStrategyLabel(rule.strategy)}</Text></View>
            <Badge label="已启用" tone="success" />
          </View>
          <View style={styles.currentDetail}><Text style={styles.detailLabel}>默认模型</Text><Text style={styles.detailValue}>{defaultModel?.label ?? "未选择"}</Text></View>
          <View style={styles.currentDetail}><Text style={styles.detailLabel}>可用候选密钥</Text><Text style={styles.detailValue}>{keys.filter((key) => key.status === "healthy").length} 个</Text></View>
        </Card>

        <Text style={styles.sectionTitle}>选择策略</Text>
        <View style={styles.strategyStack}>
          {STRATEGIES.map((strategy) => {
            const active = rule.strategy === strategy.id;
            return <Pressable key={strategy.id} onPress={() => updateRule({ strategy: strategy.id })} style={({ pressed }) => [styles.strategyCard, active && styles.strategyCardActive, pressed && styles.pressed]}>
              <View style={[styles.strategyIcon, active && styles.strategyIconActive]}><MaterialIcons name={strategy.icon} size={21} color={active ? COLORS.background : COLORS.blue} /></View>
              <View style={styles.strategyText}><Text style={[styles.strategyTitle, active && styles.strategyTitleActive]}>{strategy.title}</Text><Text style={styles.strategyDescription}>{strategy.description}</Text></View>
              <MaterialIcons name={active ? "radio-button-checked" : "radio-button-unchecked"} size={21} color={active ? COLORS.mint : COLORS.muted} />
            </Pressable>;
          })}
        </View>

        <Text style={styles.sectionTitle}>故障切换</Text>
        <Card>
          <RuleCounter title="连续失败阈值" description="达到次数后切换到候选备用密钥" value={rule.failureThreshold} unit="次" onDecrease={() => updateRule({ failureThreshold: Math.max(1, rule.failureThreshold - 1) })} onIncrease={() => updateRule({ failureThreshold: Math.min(5, rule.failureThreshold + 1) })} />
          <View style={styles.divider} />
          <RuleCounter title="冷却时间" description="失败密钥在此期间不参与候选" value={rule.cooldownSeconds} unit="秒" onDecrease={() => updateRule({ cooldownSeconds: Math.max(15, rule.cooldownSeconds - 15) })} onIncrease={() => updateRule({ cooldownSeconds: Math.min(180, rule.cooldownSeconds + 15) })} />
        </Card>

        <Card style={styles.infoCard}>
          <MaterialIcons name="info-outline" size={20} color={COLORS.blue} />
          <Text style={styles.infoText}>此版本将路由逻辑完整地在设备本地演示。接入真实 API 前，请在安全架构中决定密钥的保管方式。</Text>
        </Card>
        <View style={styles.bottomSpace} />
      </ScrollView>
    </ScreenContainer>
  );
}

function RuleCounter({ title, description, value, unit, onDecrease, onIncrease }: { title: string; description: string; value: number; unit: string; onDecrease: () => void; onIncrease: () => void }) {
  return <View style={styles.counterRow}><View style={styles.counterText}><Text style={styles.counterTitle}>{title}</Text><Text style={styles.counterDescription}>{description}</Text></View><View style={styles.stepper}><Pressable onPress={onDecrease} style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}><MaterialIcons name="remove" size={18} color={COLORS.text} /></Pressable><Text style={styles.counterValue}>{value}{unit}</Text><Pressable onPress={onIncrease} style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}><MaterialIcons name="add" size={18} color={COLORS.text} /></Pressable></View></View>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 32 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  currentCard: { marginTop: 18 },
  currentTop: { alignItems: "center", flexDirection: "row", gap: 10 },
  currentIcon: { alignItems: "center", backgroundColor: "#163D3C", borderRadius: 12, height: 44, justifyContent: "center", width: 44 },
  currentText: { flex: 1 },
  currentLabel: { color: COLORS.muted, fontSize: 11 },
  currentValue: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginTop: 2 },
  currentDetail: { borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 12 },
  detailLabel: { color: COLORS.muted, fontSize: 12 },
  detailValue: { color: COLORS.text, fontSize: 12, fontWeight: "700" },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800", marginBottom: 10, marginTop: 24 },
  strategyStack: { gap: 10 },
  strategyCard: { alignItems: "center", backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 11, padding: 13 },
  strategyCardActive: { backgroundColor: "#163937", borderColor: COLORS.mint },
  strategyIcon: { alignItems: "center", backgroundColor: "#173658", borderRadius: 11, height: 39, justifyContent: "center", width: 39 },
  strategyIconActive: { backgroundColor: COLORS.mint },
  strategyText: { flex: 1 },
  strategyTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  strategyTitleActive: { color: COLORS.mint },
  strategyDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  divider: { backgroundColor: COLORS.border, height: 1, marginVertical: 15 },
  counterRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  counterText: { flex: 1, paddingRight: 10 },
  counterTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  counterDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  stepper: { alignItems: "center", backgroundColor: "#0A1A26", borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", overflow: "hidden" },
  stepperButton: { alignItems: "center", height: 35, justifyContent: "center", width: 32 },
  counterValue: { color: COLORS.text, fontSize: 12, fontWeight: "800", minWidth: 43, textAlign: "center" },
  infoCard: { alignItems: "flex-start", flexDirection: "row", gap: 10, marginTop: 18 },
  infoText: { color: COLORS.muted, flex: 1, fontSize: 12, lineHeight: 18 },
  bottomSpace: { height: 18 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
