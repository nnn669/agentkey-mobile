import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const COLORS = {
  background: "#08131E",
  surface: "#112433",
  surfaceStrong: "#173044",
  text: "#EAF2F7",
  muted: "#8FA6B6",
  mint: "#46E0C2",
  blue: "#5E9BFF",
  amber: "#F6B75B",
  coral: "#FF6D6D",
  border: "#244458",
};

export { COLORS };

export function AgentMark({ size = 42 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <MaterialIcons name="auto-awesome" size={size * 0.54} color={COLORS.background} />
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
          <Text style={styles.textActionLabel}>{action}</Text>
          <MaterialIcons name="chevron-right" size={18} color={COLORS.mint} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "error" | "info" }) {
  const toneStyle = {
    neutral: styles.badgeNeutral,
    success: styles.badgeSuccess,
    warning: styles.badgeWarning,
    error: styles.badgeError,
    info: styles.badgeInfo,
  }[tone];
  const textStyle = {
    neutral: styles.badgeTextNeutral,
    success: styles.badgeTextSuccess,
    warning: styles.badgeTextWarning,
    error: styles.badgeTextError,
    info: styles.badgeTextInfo,
  }[tone];

  return (
    <View style={[styles.badge, toneStyle]}>
      <Text style={[styles.badgeText, textStyle]}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress, disabled = false }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, (pressed || disabled) && styles.pressed, disabled && styles.disabled]}
    >
      <MaterialIcons name={icon} size={20} color={COLORS.background} />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: "center", backgroundColor: COLORS.mint, justifyContent: "center" },
  sectionTitleRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10, marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  textAction: { alignItems: "center", flexDirection: "row", gap: 2, paddingVertical: 4 },
  textActionLabel: { color: COLORS.mint, fontSize: 13, fontWeight: "700" },
  card: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderRadius: 20, borderWidth: 1, padding: 16 },
  badge: { alignSelf: "flex-start", borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  badgeNeutral: { backgroundColor: "#1C3646" },
  badgeSuccess: { backgroundColor: "#143E3A" },
  badgeWarning: { backgroundColor: "#49371F" },
  badgeError: { backgroundColor: "#482A31" },
  badgeInfo: { backgroundColor: "#203C69" },
  badgeTextNeutral: { color: COLORS.muted },
  badgeTextSuccess: { color: COLORS.mint },
  badgeTextWarning: { color: COLORS.amber },
  badgeTextError: { color: COLORS.coral },
  badgeTextInfo: { color: COLORS.blue },
  primaryButton: { alignItems: "center", backgroundColor: COLORS.mint, borderRadius: 15, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 50, paddingHorizontal: 16 },
  primaryButtonText: { color: COLORS.background, fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
});
