import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/src/lib/theme";
import { useAuth } from "@/src/lib/auth";

export default function KidLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  if (!user || user.role !== "child") {
    return <Redirect href="/(auth)/login" />;
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.brand,
        tabBarInactiveTintColor: T.onSurfaceMuted,
        tabBarStyle: {
          backgroundColor: T.white,
          borderTopColor: T.border, borderTopWidth: 2,
          paddingTop: 6,
          height: 62 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontWeight: "800", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil", tabBarIcon: ({ color }) => <Ionicons name="home" size={22} color={color} /> }} />
      <Tabs.Screen name="tasks" options={{ title: "Tâches", tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Classement", tabBarIcon: ({ color }) => <Ionicons name="trophy" size={22} color={color} /> }} />
      <Tabs.Screen name="shop" options={{ title: "Cadeau", tabBarIcon: ({ color }) => <Ionicons name="gift" size={22} color={color} /> }} />
      <Tabs.Screen name="menu" options={{ title: "Menu", tabBarIcon: ({ color }) => <Ionicons name="restaurant-outline" size={22} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "Plus", tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={22} color={color} /> }} />
    </Tabs>
  );
}
