import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader, EmptyState, Card } from "@/src/components/UI";
 
export default function Leaderboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
 
  const load = useCallback(async () => {
    try { const r = await api.get("/family/leaderboard"); setMembers(r.members || []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
 
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
 
  const podium = members.slice(0, 3);
  const rest = members.slice(3);
 
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader 
      title="Classement" 
      subtitle="Cette semaine" 
      left={
          <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={T.onSurface} />
          </Pressable>
        }
        />
      <ScrollView
        contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}
      >
        {members.length === 0 ? (
          <EmptyState emoji="🏆" title="Podium vide" subtitle="Termine des tâches pour grimper !" />
        ) : (
          <>
            <View style={s.podium}>
              {podium[1] && <PodiumBlock member={podium[1]} place={2} height={90} me={user?.id} />}
              {podium[0] && <PodiumBlock member={podium[0]} place={1} height={120} me={user?.id} />}
              {podium[2] && <PodiumBlock member={podium[2]} place={3} height={70} me={user?.id} />}
            </View>
            <Card>
              {rest.length === 0 && <Text style={s.hint}>Le podium résume la tribu !</Text>}
              {rest.map((m, i) => (
                <View key={m.id} style={s.row}>
                  <Text style={s.rank}>{i + 4}</Text>
                  <Text style={{ fontSize: 22 }}>{m.avatar}</Text>
                  <Text style={[s.name, m.id === user?.id && { color: T.brand }]}>{m.name}</Text>
                  <Text style={s.pts}>{m.points} pts</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
 
function PodiumBlock({ member, place, height, me }: any) {
  const bg = place === 1 ? T.gold : place === 2 ? "#D6D2C4" : T.orange;
  return (
    <View style={{ flex: 1, alignItems: "center" }} testID={`podium-${place}`}>
      <Text style={{ fontSize: 44 }}>{member.avatar}</Text>
      <Text style={[podiumS.name, member.id === me && { color: T.brand }]}>{member.name}</Text>
      <Text style={podiumS.pts}>{member.points} pts</Text>
      <View style={[podiumS.block, { height, backgroundColor: bg }]}>
        <Text style={podiumS.medal}>{place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉"}</Text>
      </View>
    </View>
  );
}
 
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  podium: { flexDirection: "row", gap: S.sm, alignItems: "flex-end" },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: T.border },
  rank: { width: 32, fontWeight: "900", color: T.onSurfaceMuted, fontSize: 16 },
  name: { flex: 1, fontWeight: "800", color: T.onSurface, fontSize: 15 },
  pts: { fontWeight: "900", color: T.brand },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: T.white, borderWidth: 2, borderColor: T.border },
  hint: { color: T.onSurfaceMuted, textAlign: "center", padding: S.md },
});
const podiumS = StyleSheet.create({
  name: { fontWeight: "900", fontSize: 14, color: T.onSurface, marginTop: 4 },
  pts: { fontSize: 12, fontWeight: "700", color: T.onSurfaceMuted },
  block: { width: "100%", borderTopLeftRadius: R.md, borderTopRightRadius: R.md, alignItems: "center", justifyContent: "center", marginTop: S.sm, borderWidth: 2, borderColor: T.borderStrong },
  medal: { fontSize: 30 },
});
