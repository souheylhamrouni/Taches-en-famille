import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader } from "@/src/components/UI";

export default function More() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const links = [
    { id: "calendar", label: "Calendrier familial", icon: "calendar" as const, path: "/shared/calendar" },
    { id: "shopping", label: "Liste de courses", icon: "cart" as const, path: "/shared/shopping" },
    { id: "validations", label: "Valider les preuves", icon: "checkmark-done-circle" as const, path: "/shared/validate" },
  ];

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title="Plus" subtitle={user?.name} />
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.sm }}>
        {links.map(l => (
          <Pressable key={l.id} testID={`more-${l.id}`} onPress={() => router.push(l.path as any)}
            style={({ pressed }) => [s.row, pressed && { opacity: 0.9 }]}>
            <View style={s.iconWrap}><Ionicons name={l.icon} size={22} color={T.brand} /></View>
            <Text style={s.rowLabel}>{l.label}</Text>
            <Ionicons name="chevron-forward" size={20} color={T.onSurfaceMuted} />
          </Pressable>
        ))}
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
  row: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, borderColor: T.border },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EFFBE0", alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontWeight: "800", color: T.onSurface, fontSize: 15 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, padding: S.md, borderRadius: R.pill, backgroundColor: "#FFECEC", borderWidth: 2, borderColor: T.red },
  logoutText: { color: T.red, fontWeight: "900" },
});
