import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 60 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#46E0C2",
        tabBarInactiveTintColor: "#7991A1",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginTop: 1 },
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: "#0B1A26",
          borderTopColor: "#244458",
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "工作台", tabBarIcon: ({ color }) => <IconSymbol size={25} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="tasks" options={{ title: "任务", tabBarIcon: ({ color }) => <IconSymbol size={25} name="sparkles" color={color} /> }} />
      <Tabs.Screen name="providers" options={{ title: "API", tabBarIcon: ({ color }) => <IconSymbol size={25} name="server.rack" color={color} /> }} />
      <Tabs.Screen name="mcp" options={{ title: "MCP", tabBarIcon: ({ color }) => <IconSymbol size={25} name="wrench.and.screwdriver.fill" color={color} /> }} />
      <Tabs.Screen name="memory" options={{ title: "记忆", tabBarIcon: ({ color }) => <IconSymbol size={25} name="brain.head.profile" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="shell" options={{ href: null }} />
      <Tabs.Screen name="keys" options={{ href: null }} />
      <Tabs.Screen name="rules" options={{ href: null }} />
    </Tabs>
  );
}
