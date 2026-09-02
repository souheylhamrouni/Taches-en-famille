import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@/src/lib/theme";
import { useAuth } from "@/src/lib/auth";

export default function ParentLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  if (!user || user.role !== "parent") {
    return <Redirect href="/(auth)/login" />;
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.orange,
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
      <Tabs.Screen name="index" options={{ title: "Tableau", tabBarIcon: ({ color }) => <Ionicons name="grid" size={22} color={color} /> }} />
      <Tabs.Screen name="tasks-admin" options={{ title: "Tâches", tabBarIcon: ({ color }) => <Ionicons name="list" size={22} color={color} /> }} />
      
      <Tabs.Screen name="calendar" options={{ title: "Calendrier", tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} /> }} />
      
      <Tabs.Screen name="shopping" options={{ title: "Courses", tabBarIcon: ({ color }) => <Ionicons name="cart" size={22} color={color} /> }} />
      
      {/*<Tabs.Screen name="rewards-admin" options={{ title: "Cadeaux", tabBarIcon: ({ color }) => <Ionicons name="gift" size={22} color={color} /> }} />*/}
      <Tabs.Screen name="menu" options={{ title: "Menu", tabBarIcon: ({ color }) => <Ionicons name="restaurant-outline" size={22} color={color} /> }} />
      <Tabs.Screen name="rewards-admin" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ title: "Réglages", tabBarIcon: ({ color }) => <Ionicons name="settings" size={22} color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
      
    </Tabs>
  );
}
