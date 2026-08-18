import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";

export default function Badges() {
  const router = useRouter();
  const [badges, setBadges] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/badges");
      setBadges(r.badges || []); setCount(r.unlocked_count || 0); setTotal(r.total || 0);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Mes badges</Text>
          <Text style={s.sub}>{count} / {total} débloqués</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.gold} />}>
        <View style={s.progressCard}>
          <Text style={s.progressLabel}>Collection</Text>
          <View style={s.track}><View style={[s.fill, { width: `${total ? (count / total) * 100 : 0}%` }]} /></View>
          <Text style={s.progressHint}>Continue tes tâches pour tous les débloquer ! 🏅</Text>
        </View>

        <View style={s.grid}>
          {badges.map(b => (
            <View key={b.id} style={[s.badge, b.unlocked ? s.badgeOn : s.badgeOff]} testID={`badge-${b.id}`}>
              <Text style={[s.emoji, !b.unlocked && s.emojiLocked]}>{b.unlocked ? b.emoji : "🔒"}</Text>
              <Text style={s.bTitle} numberOfLines={2}>{b.title}</Text>
              <Text style={s.bDesc} numberOfLines={2}>{b.description}</Text>
              {!b.unlocked && (
                <View style={s.miniTrack}>
                  <View style={[s.miniFill, { width: `${(b.progress || 0) * 100}%` }]} />
                </View>
              )}
              {!b.unlocked ? <Text style={s.bProgress}>{b.current}/{b.threshold}</Text>
                : <View style={s.doneTag}><Text style={s.doneTagText}>Débloqué</Text></View>}
            </View>
          ))}
        </View>
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
  progressCard: { backgroundColor: T.white, borderRadius: R.lg, padding: S.lg, borderWidth: 2, borderColor: T.border, marginBottom: S.lg },
  progressLabel: { fontWeight: "900", color: T.onSurface, fontSize: 15 },
  track: { height: 14, backgroundColor: T.surfaceSecondary, borderRadius: R.pill, overflow: "hidden", borderWidth: 2, borderColor: T.border, marginTop: S.sm },
  fill: { height: "100%", backgroundColor: T.gold, borderRadius: R.pill },
  progressHint: { color: T.onSurfaceMuted, fontSize: 12, marginTop: S.sm, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  badge: { width: "48%", borderRadius: R.lg, padding: S.md, alignItems: "center", borderWidth: 2, gap: 4, minHeight: 150, justifyContent: "center" },
  badgeOn: { backgroundColor: "#FFFBEA", borderColor: T.gold },
  badgeOff: { backgroundColor: T.surfaceSecondary, borderColor: T.border },
  emoji: { fontSize: 44 },
  emojiLocked: { opacity: 0.5 },
  bTitle: { fontWeight: "900", color: T.onSurface, textAlign: "center", fontSize: 14 },
  bDesc: { color: T.onSurfaceMuted, fontSize: 11, textAlign: "center" },
  miniTrack: { width: "80%", height: 6, backgroundColor: T.surfaceTertiary, borderRadius: R.pill, overflow: "hidden", marginTop: 4 },
  miniFill: { height: "100%", backgroundColor: T.orange },
  bProgress: { fontWeight: "800", color: T.onSurfaceMuted, fontSize: 11 },
  doneTag: { backgroundColor: T.brand, paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.pill },
  doneTagText: { color: T.white, fontWeight: "900", fontSize: 10 },
});
