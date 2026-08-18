import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader, EmptyState, PointsPill } from "@/src/components/UI";

export default function Shop() {
  const { user, refresh } = useAuth();
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
      setFlash(`🎉 Bravo ! « ${r.title} » réclamée`);
      await refresh();
      setTimeout(() => setFlash(null), 3000);
    } catch (e: any) {
      setFlash(`❌ ${e.message}`);
      setTimeout(() => setFlash(null), 3000);
    }
    setBusyId(null);
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title="Boutique" subtitle="Dépense tes points" right={user ? <PointsPill value={user.points} /> : null} />
      {flash ? <View style={s.flash} testID="shop-flash"><Text style={s.flashText}>{flash}</Text></View> : null}
      <ScrollView
        contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}
      >
        {rewards.length === 0 ? (
          <EmptyState emoji="🎁" title="La boutique est vide !" subtitle="Demande à un parent d'ajouter des récompenses" />
        ) : (
          <View style={s.grid}>
            {rewards.map((r) => {
              const canAfford = (user?.points || 0) >= r.point_cost;
              return (
                <View key={r.id} style={s.card} testID={`reward-${r.id}`}>
                  <Text style={{ fontSize: 44 }}>{r.icon || "🎁"}</Text>
                  <Text style={s.title} numberOfLines={2}>{r.title}</Text>
                  <View style={s.cost}>
                    <Text style={s.costText}>⭐ {r.point_cost}</Text>
                  </View>
                  <Pressable
                    testID={`claim-${r.id}`}
                    disabled={!canAfford || busyId === r.id}
                    onPress={() => claim(r)}
                    style={({ pressed }) => [
                      s.claimBtn,
                      !canAfford && { backgroundColor: T.surfaceTertiary, borderBottomColor: T.borderStrong },
                      pressed && { opacity: 0.85 }
                    ]}
                  >
                    <Text style={[s.claimText, !canAfford && { color: T.onSurfaceMuted }]}>
                      {canAfford ? "Réclamer" : "Trop cher"}
                    </Text>
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
  flash: { margin: S.lg, padding: S.md, backgroundColor: "#EFFBE0", borderRadius: R.md, borderWidth: 2, borderColor: T.brand },
  flashText: { fontWeight: "800", color: T.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  card: { width: "48%", backgroundColor: T.white, borderRadius: R.lg, padding: S.md, borderWidth: 2, borderColor: T.border, alignItems: "center", gap: S.xs },
  title: { fontWeight: "900", color: T.onSurface, textAlign: "center", fontSize: 14, minHeight: 36 },
  cost: { backgroundColor: T.gold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, marginVertical: 4 },
  costText: { fontWeight: "900", color: T.onSurface, fontSize: 12 },
  claimBtn: { width: "100%", backgroundColor: T.brand, paddingVertical: 10, borderRadius: R.pill, alignItems: "center", borderBottomWidth: 3, borderBottomColor: T.brandDark, marginTop: 4 },
  claimText: { color: T.white, fontWeight: "900", fontSize: 13 },
});
