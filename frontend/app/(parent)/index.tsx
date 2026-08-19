import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader, Card } from "@/src/components/UI";

export default function ParentDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<any[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [claims, setClaims] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [p, lb, pen, cl, fam] = await Promise.all([
        api.get("/completions/pending"),
        api.get("/family/leaderboard"),
        api.get("/penalties"),
        api.get("/claims"),
        api.get("/family"),
      ]);
      setPending(p.completions || []);
      setTop((lb.members || []).slice(0, 3));
      setPenalties((pen.penalties || []).slice(0, 5));
      setClaims((cl.claims || []).slice(0, 5));
      setFamily(fam.family);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title={`Bonjour ${user?.name}`} subtitle={family?.name || "Tableau de bord"} />
      <ScrollView
        contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.orange} />}
      >
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <StatBox label="À valider" value={pending.length} color={T.orange} onPress={() => router.push("/shared/validate")} testID="stat-pending" />
          <StatBox label="Récompenses" value={claims.length} color={T.brand} testID="stat-claims" />
          <StatBox label="Pénalités" value={penalties.length} color={T.red} testID="stat-penalties" />
        </View>

        {family && (
          <Card testID="family-code-card">
            <Text style={s.cardTitle}>🏠 Code famille</Text>
            <Text style={{ color: T.onSurfaceMuted, marginTop: 4 }}>{"Partagez ce code avec les enfants lors de l'inscription :"}</Text>
            <View style={s.codeBox}>
              <Text style={s.codeText} selectable numberOfLines={1}>{family.id}</Text>
            </View>
          </Card>
        )}

        <View>
          <Text style={s.sectionTitle}>🏆 Top de la semaine</Text>
          <Card>
            {top.length === 0 ? <Text style={s.hint}>Pas encore de leaders</Text> :
              top.map((m, i) => (
                <View key={m.id} style={s.row}>
                  <Text style={{ fontSize: 24, width: 32 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</Text>
                  <Text style={{ fontSize: 22 }}>{m.avatar}</Text>
                  <Text style={s.rowName}>{m.name}</Text>
                  <Text style={s.rowPts}>{m.points} pts · 🔥{m.streak}</Text>
                </View>
              ))
            }
          </Card>
        </View>

        <View>
          <Text style={s.sectionTitle}>⚡ Raccourcis</Text>
          <View style={s.shortcuts}>
            <Shortcut icon="checkmark-done-circle" label="Valider" onPress={() => router.push("/shared/validate")} testID="short-validate" badge={pending.length} />
            <Shortcut icon="flame" label="Mes tâches" onPress={() => router.push("/shared/mytasks")} testID="short-mytasks" />
            <Shortcut icon="gift" label="Boutique" onPress={() => router.push("/shared/myrewards")} testID="short-myrewards" />
            <Shortcut icon="flag" label="Défi" onPress={() => router.push("/shared/challenges")} testID="short-challenge" />
          </View>
          <View style={[s.shortcuts, { marginTop: S.sm }]}>
            <Shortcut icon="calendar" label="Calendrier" onPress={() => router.push("/shared/calendar")} testID="short-calendar" />
            <Shortcut icon="cart" label="Courses" onPress={() => router.push("/shared/shopping")} testID="short-shopping" />
            <Shortcut icon="people" label="Membres" onPress={() => router.push("/shared/members")} testID="short-members" />
          </View>
        </View>

        {penalties.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>⚠️ Pénalités récentes</Text>
            <Card>
              {penalties.map(p => (
                <View key={p.id} style={s.penaltyRow}>
                  <Ionicons name="alert-circle" size={18} color={T.red} />
                  <Text style={s.penaltyText}>{p.user_name} · {p.task_title}</Text>
                  <Text style={s.penaltyPts}>-{p.points_deducted}</Text>
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value, color, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.stat, { borderColor: color }, pressed && { opacity: 0.85 }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Pressable>
  );
}
function Shortcut({ icon, label, onPress, testID, badge }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.shortcut, pressed && { opacity: 0.85 }]}>
      <View style={s.shortIcon}><Ionicons name={icon} size={24} color={T.orange} /></View>
      <Text style={s.shortLabel} numberOfLines={1}>{label}</Text>
      {badge > 0 ? <View style={s.shortBadge}><Text style={s.shortBadgeText}>{badge}</Text></View> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  stat: { flex: 1, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, alignItems: "center" },
  statValue: { fontSize: 26, fontWeight: "900" },
  statLabel: { fontSize: 11, color: T.onSurfaceMuted, marginTop: 2, fontWeight: "700" },
  cardTitle: { fontWeight: "900", fontSize: 16, color: T.onSurface },
  codeBox: { backgroundColor: T.surfaceSecondary, marginTop: S.sm, padding: S.md, borderRadius: R.md, borderWidth: 2, borderColor: T.border },
  codeText: { fontWeight: "800", color: T.onSurface, fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: T.onSurface, marginBottom: S.sm },
  row: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: S.sm },
  rowName: { flex: 1, fontWeight: "800", color: T.onSurface },
  rowPts: { fontWeight: "800", color: T.brand },
  shortcuts: { flexDirection: "row", gap: S.sm },
  shortcut: { flex: 1, backgroundColor: T.white, padding: S.sm, borderRadius: R.lg, borderWidth: 2, borderColor: T.border, alignItems: "center", gap: 4 },
  shortIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  shortLabel: { fontWeight: "800", fontSize: 11, color: T.onSurface },
  shortBadge: { position: "absolute", top: 6, right: 6, backgroundColor: T.red, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  shortBadgeText: { color: T.white, fontWeight: "900", fontSize: 11 },
  hint: { color: T.onSurfaceMuted, textAlign: "center", padding: S.sm },
  penaltyRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 8 },
  penaltyText: { flex: 1, color: T.onSurface, fontWeight: "700", fontSize: 13 },
  penaltyPts: { color: T.red, fontWeight: "900" },
});
