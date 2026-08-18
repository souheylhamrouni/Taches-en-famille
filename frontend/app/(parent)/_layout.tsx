import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { T } from "@/src/lib/theme";

export default function ParentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.orange,
        tabBarInactiveTintColor: T.onSurfaceMuted,
        tabBarStyle: { backgroundColor: T.white, borderTopColor: T.border, borderTopWidth: 2, paddingTop: 6, height: 68, paddingBottom: 10 },
        tabBarLabelStyle: { fontWeight: "800", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Tableau", tabBarIcon: ({ color }) => <Ionicons name="grid" size={22} color={color} /> }} />
      <Tabs.Screen name="tasks-admin" options={{ title: "Tâches", tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }} />
      <Tabs.Screen name="rewards-admin" options={{ title: "Récompenses", tabBarIcon: ({ color }) => <Ionicons name="gift" size={22} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Réglages", tabBarIcon: ({ color }) => <Ionicons name="settings" size={22} color={color} /> }} />
    </Tabs>
  );
}
