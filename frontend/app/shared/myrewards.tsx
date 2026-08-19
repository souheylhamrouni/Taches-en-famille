import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { EmptyState, PointsPill } from "@/src/components/UI";

export default function MyRewards() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [rewards, setRewards] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get("/rewards"); setRewards(r.rewards || []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); await refresh(); setRefreshing(false); };

  const claim = async (r: any) => {
    setBusyId(r.id);
    try {
      await api.post(`/rewards/${r.id}/claim`);
      setFlash(`🎉 « ${r.title} » réclamée`);
      await refresh(); setTimeout(() => setFlash(null), 3000);
    } catch (e: any) { setFlash(`❌ ${e.message}`); setTimeout(() => setFlash(null), 3000); }
    setBusyId(null);
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Boutique</Text>
          <Text style={s.sub}>Dépensez vos points</Text>
        </View>
        {user ? <PointsPill value={user.points} /> : null}
      </View>
      {flash ? <View style={s.flash} testID="myrewards-flash"><Text style={s.flashText}>{flash}</Text></View> : null}
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}>
        {rewards.length === 0 ? <EmptyState emoji="🎁" title="Boutique vide" subtitle="Aucune récompense pour l'instant" /> : (
          <View style={s.grid}>
            {rewards.map(r => {
              const can = (user?.points || 0) >= r.point_cost;
              return (
                <View key={r.id} style={s.card} testID={`myreward-${r.id}`}>
                  <Text style={{ fontSize: 44 }}>{r.icon || "🎁"}</Text>
                  <Text style={s.cardTitle} numberOfLines={2}>{r.title}</Text>
                  <View style={s.cost}><Text style={s.costText}>⭐ {r.point_cost}</Text></View>
                  <Pressable testID={`myclaim-${r.id}`} disabled={!can || busyId === r.id} onPress={() => claim(r)}
                    style={({ pressed }) => [s.claim, !can && { backgroundColor: T.surfaceTertiary, borderBottomColor: T.borderStrong }, pressed && { opacity: 0.85 }]}>
                    <Text style={[s.claimText, !can && { color: T.onSurfaceMuted }]}>{can ? "Réclamer" : "Trop cher"}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  header: { flexDirection: "row", padding: S.lg, gap: S.sm, alignItems: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: T.white, borderWidth: 2, borderColor: T.border },
  title: { fontSize: 22, fontWeight: "900", color: T.onSurface },
  sub: { color: T.onSurfaceMuted, fontSize: 13 },
  flash: { marginHorizontal: S.lg, padding: S.md, backgroundColor: "#EFFBE0", borderRadius: R.md, borderWidth: 2, borderColor: T.brand },
  flashText: { fontWeight: "800", color: T.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  card: { width: "48%", backgroundColor: T.white, borderRadius: R.lg, padding: S.md, borderWidth: 2, borderColor: T.border, alignItems: "center", gap: S.xs },
  cardTitle: { fontWeight: "900", color: T.onSurface, textAlign: "center", fontSize: 14, minHeight: 36 },
  cost: { backgroundColor: T.gold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, marginVertical: 4 },
  costText: { fontWeight: "900", color: T.onSurface, fontSize: 12 },
  claim: { width: "100%", backgroundColor: T.brand, paddingVertical: 10, borderRadius: R.pill, alignItems: "center", borderBottomWidth: 3, borderBottomColor: T.brandDark, marginTop: 4 },
  claimText: { color: T.white, fontWeight: "900", fontSize: 13 },
});
