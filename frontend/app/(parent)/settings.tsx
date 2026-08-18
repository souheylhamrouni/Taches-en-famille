import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader, Card } from "@/src/components/UI";
import { clearPin } from "@/src/lib/api";

export default function Settings() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title="Réglages" subtitle={user?.name} />
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.sm }}>
        <Card>
          <Text style={s.who}>{user?.avatar} {user?.name}</Text>
          <Text style={s.email}>{user?.email}</Text>
          <Text style={s.role}>👑 Parent</Text>
        </Card>

        <Pressable testID="link-calendar" onPress={() => router.push("/shared/calendar")}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.9 }]}>
          <View style={s.iconWrap}><Ionicons name="calendar" size={22} color={T.orange} /></View>
          <Text style={s.rowLabel}>Calendrier familial</Text>
          <Ionicons name="chevron-forward" size={20} color={T.onSurfaceMuted} />
        </Pressable>
        <Pressable testID="link-shopping" onPress={() => router.push("/shared/shopping")}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.9 }]}>
          <View style={s.iconWrap}><Ionicons name="cart" size={22} color={T.orange} /></View>
          <Text style={s.rowLabel}>Liste de courses</Text>
          <Ionicons name="chevron-forward" size={20} color={T.onSurfaceMuted} />
        </Pressable>
        <Pressable testID="clear-pin-button" onPress={clearPin}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.9 }]}>
          <View style={s.iconWrap}><Ionicons name="lock-closed" size={22} color={T.orange} /></View>
          <Text style={s.rowLabel}>Verrouiller le mode parent</Text>
          <Ionicons name="chevron-forward" size={20} color={T.onSurfaceMuted} />
        </Pressable>

        <View style={{ height: S.xl }} />
        <Pressable testID="logout-button" onPress={logout} style={({ pressed }) => [s.logout, pressed && { opacity: 0.85 }]}>
          <Ionicons name="log-out-outline" size={20} color={T.red} />
          <Text style={s.logoutText}>Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  who: { fontWeight: "900", fontSize: 20, color: T.onSurface },
  email: { color: T.onSurfaceMuted, marginTop: 2 },
  role: { color: T.orange, fontWeight: "800", marginTop: S.sm },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, borderColor: T.border },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontWeight: "800", color: T.onSurface, fontSize: 15 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, padding: S.md, borderRadius: R.pill, backgroundColor: "#FFECEC", borderWidth: 2, borderColor: T.red },
  logoutText: { color: T.red, fontWeight: "900" },
});
