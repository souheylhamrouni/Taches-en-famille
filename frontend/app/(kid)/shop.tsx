import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader, EmptyState, PointsPill, Card } from "@/src/components/UI";

export default function Shop() {
  const { user, refresh } = useAuth();
  const [rewards, setRewards] = useState<any[]>([]);
  const [myClaims, setMyClaims] = useState<any[]>([]);
  const [tab, setTab] = useState<"catalog" | "myclaims">("catalog");
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api.get("/rewards"),
        api.get("/claims")
      ]);
      setRewards(r.rewards || []);
      const userClaims = (c.claims || []).filter((cl: any) => cl.user_id === user?.id);
      setMyClaims(userClaims);
    } catch {}
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); await refresh(); setRefreshing(false); };

  const claim = async (r: any) => {
    setBusyId(r.id);
    try {
      await api.post(`/rewards/${r.id}/claim`);
      setFlash(`🎉 Bravo ! « ${r.title} » réclamée`);
      await load();
      await refresh();
      setTimeout(() => setFlash(null), 3000);
    } catch (e: any) {
      setFlash(`❌ ${e.message}`);
      setTimeout(() => setFlash(null), 3000);
    }
    setBusyId(null);
  };

  const pendingClaimsCount = myClaims.filter(c => c.status === "pending").length;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader
        title="Boutique"
        subtitle="Dépense tes points et suis tes cadeaux"
        right={user ? <PointsPill value={user.points} /> : null}
      />

      {/* Tabs */}
      <View style={s.tabsWrap}>
        <Pressable
          testID="tab-shop-catalog"
          onPress={() => setTab("catalog")}
          style={[s.tabItem, tab === "catalog" && s.tabItemActive]}
        >
          <Text style={[s.tabText, tab === "catalog" && s.tabTextActive]}>🎁 Boutique</Text>
        </Pressable>
        <Pressable
          testID="tab-shop-myclaims"
          onPress={() => setTab("myclaims")}
          style={[s.tabItem, tab === "myclaims" && s.tabItemActive]}
        >
          <Text style={[s.tabText, tab === "myclaims" && s.tabTextActive]}>
            📦 Mes Cadeaux {pendingClaimsCount > 0 ? `(${pendingClaimsCount})` : ""}
          </Text>
        </Pressable>
      </View>

      {flash ? (
        <View style={s.flash} testID="shop-flash">
          <Text style={s.flashText}>{flash}</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}
      >
        {tab === "catalog" ? (
          rewards.length === 0 ? (
            <EmptyState emoji="🎁" title="La boutique est vide !" subtitle="Demande à un parent d'ajouter des récompenses" />
          ) : (
            <View style={s.grid}>
              {rewards.map((r) => {
                const cost = r.point_cost || r.cost;
                const canAfford = (user?.points || 0) >= cost;
                return (
                  <View key={r.id} style={s.card} testID={`reward-${r.id}`}>
                    <Text style={{ fontSize: 44 }}>{r.icon || "🎁"}</Text>
                    <Text style={s.title} numberOfLines={2}>{r.title}</Text>
                    <View style={s.cost}>
                      <Text style={s.costText}>⭐ {cost}</Text>
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
          )
        ) : (
          /* My Claims Tab */
          myClaims.length === 0 ? (
            <EmptyState emoji="🛍️" title="Aucun cadeau réclamé" subtitle="Choisis une récompense dans la boutique !" />
          ) : (
            <View style={{ gap: S.sm }}>
              {myClaims.map((c) => {
                const isDelivered = c.status === "delivered";
                return (
                  <Card key={c.id} testID={`my-claim-${c.id}`} style={isDelivered ? s.deliveredCard : undefined}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                      <Text style={{ fontSize: 36 }}>{isDelivered ? "🎉" : "⏳"}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.claimTitle}>{c.reward_title}</Text>
                        <Text style={s.claimSub}>
                          {isDelivered
                            ? `Remis par ${c.delivered_by_name || "un parent"} !`
                            : "En attente de remise par un parent"}
                        </Text>
                      </View>
                      <View style={[s.statusBadge, isDelivered ? s.badgeDelivered : s.badgePending]}>
                        <Text style={[s.statusBadgeText, isDelivered ? s.textDelivered : s.textPending]}>
                          {isDelivered ? "Remis ✅" : "En cours ⏳"}
                        </Text>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  tabsWrap: { flexDirection: "row", marginHorizontal: S.lg, marginBottom: S.sm, backgroundColor: T.surfaceSecondary, borderRadius: R.pill, padding: 4 },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: R.pill },
  tabItemActive: { backgroundColor: T.white, shadowColor: T.shadow, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontWeight: "800", fontSize: 13, color: T.onSurfaceMuted },
  tabTextActive: { color: T.onSurface, fontWeight: "900" },
  flash: { margin: S.lg, padding: S.md, backgroundColor: "#EFFBE0", borderRadius: R.md, borderWidth: 2, borderColor: T.brand },
  flashText: { fontWeight: "800", color: T.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  card: { width: "48%", backgroundColor: T.white, borderRadius: R.lg, padding: S.md, borderWidth: 2, borderColor: T.border, alignItems: "center", gap: S.xs },
  title: { fontWeight: "900", color: T.onSurface, textAlign: "center", fontSize: 14, minHeight: 36 },
  cost: { backgroundColor: T.gold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, marginVertical: 4 },
  costText: { fontWeight: "900", color: T.onSurface, fontSize: 12 },
  claimBtn: { width: "100%", backgroundColor: T.brand, paddingVertical: 10, borderRadius: R.pill, alignItems: "center", borderBottomWidth: 3, borderBottomColor: T.brandDark, marginTop: 4 },
  claimText: { color: T.white, fontWeight: "900", fontSize: 13 },
  claimTitle: { fontWeight: "900", fontSize: 15, color: T.onSurface },
  claimSub: { fontSize: 12, color: T.onSurfaceMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill },
  badgePending: { backgroundColor: "#FFF3E0", borderWidth: 1, borderColor: T.orange },
  badgeDelivered: { backgroundColor: "#EFFBE0", borderWidth: 1, borderColor: T.brand },
  statusBadgeText: { fontSize: 11, fontWeight: "900" },
  textPending: { color: T.orange },
  textDelivered: { color: T.brandDark },
  deliveredCard: { backgroundColor: "#FAFAF7" },
});
