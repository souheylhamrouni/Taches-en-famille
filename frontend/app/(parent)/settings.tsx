import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader, Card } from "@/src/components/UI";
import { clearPin } from "@/src/lib/api";
import DeleteAccountModal from "@/src/components/DeleteAccountModal";

export default function Settings() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title="Réglages" subtitle={user?.name} />
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.sm }}>
        <Card>
          <Text style={s.who}>{user?.avatar} {user?.name}</Text>
          <Text style={s.email}>{user?.email}</Text>
          <Text style={s.role}>👑 Adulte</Text>
        </Card>

        <Pressable testID="link-account" onPress={() => router.push("/shared/account")}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.9 }]}>
          <View style={s.iconWrap}><Ionicons name="person-circle" size={22} color={T.orange} /></View>
          <Text style={s.rowLabel}>Mon compte</Text>
          <Ionicons name="chevron-forward" size={20} color={T.onSurfaceMuted} />
        </Pressable>
        <Pressable testID="link-members" onPress={() => router.push("/shared/members")}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.9 }]}>
          <View style={s.iconWrap}><Ionicons name="people" size={22} color={T.orange} /></View>
          <Text style={s.rowLabel}>Membres de la tribu</Text>
          <Ionicons name="chevron-forward" size={20} color={T.onSurfaceMuted} />
        </Pressable>
        <Pressable testID="link-challenge" onPress={() => router.push("/shared/challenges")}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.9 }]}>
          <View style={s.iconWrap}><Ionicons name="flag" size={22} color={T.orange} /></View>
          <Text style={s.rowLabel}>Défi tribal</Text>
          <Ionicons name="chevron-forward" size={20} color={T.onSurfaceMuted} />
        </Pressable>
        <Pressable testID="link-pauses" onPress={() => router.push("/shared/pauses")}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.9 }]}>
          <View style={s.iconWrap}><Ionicons name="pause-circle" size={22} color={T.orange} /></View>
          <Text style={s.rowLabel}>Pauses & congés</Text>
          <Ionicons name="chevron-forward" size={20} color={T.onSurfaceMuted} />
        </Pressable>
        <Pressable testID="link-calendar" onPress={() => router.push("/shared/calendar")}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.9 }]}>
          <View style={s.iconWrap}><Ionicons name="calendar" size={22} color={T.orange} /></View>
          <Text style={s.rowLabel}>Calendrier tribal</Text>
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
          <Text style={s.rowLabel}>Verrouiller le mode adulte</Text>
          <Ionicons name="chevron-forward" size={20} color={T.onSurfaceMuted} />
        </Pressable>

        <View style={{ height: S.xl }} />
        <Pressable testID="logout-button" onPress={logout} style={({ pressed }) => [s.logout, pressed && { opacity: 0.85 }]}>
          <Ionicons name="log-out-outline" size={20} color={T.red} />
          <Text style={s.logoutText}>Se déconnecter</Text>
        </Pressable>
        <Pressable testID="delete-account-button" onPress={() => setShowDelete(true)} style={({ pressed }) => [s.deleteRow, pressed && { opacity: 0.85 }]}>
          <Ionicons name="trash-outline" size={18} color={T.onSurfaceMuted} />
          <Text style={s.deleteText}>Supprimer mon compte</Text>
        </Pressable>
      </ScrollView>
      <DeleteAccountModal visible={showDelete} onCancel={() => setShowDelete(false)} />
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
  deleteRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.xs, padding: S.md, marginTop: S.sm },
  deleteText: { color: T.onSurfaceMuted, fontWeight: "700", fontSize: 13, textDecorationLine: "underline" },
});
