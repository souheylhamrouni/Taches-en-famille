import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { T } from "@/src/lib/theme";

export default function KidLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.brand,
        tabBarInactiveTintColor: T.onSurfaceMuted,
        tabBarStyle: {
          backgroundColor: T.white,
          borderTopColor: T.border, borderTopWidth: 2,
          paddingTop: 6, height: 68, paddingBottom: 10,
        },
        tabBarLabelStyle: { fontWeight: "800", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil", tabBarIcon: ({ color }) => <Ionicons name="home" size={22} color={color} /> }} />
      <Tabs.Screen name="tasks" options={{ title: "Tâches", tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Classement", tabBarIcon: ({ color }) => <Ionicons name="trophy" size={22} color={color} /> }} />
      <Tabs.Screen name="shop" options={{ title: "Boutique", tabBarIcon: ({ color }) => <Ionicons name="gift" size={22} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "Plus", tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={22} color={color} /> }} />
    </Tabs>
  );
}
