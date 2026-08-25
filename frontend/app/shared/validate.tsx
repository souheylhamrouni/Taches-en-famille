import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, storage, BACKEND_URL } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { EmptyState } from "@/src/components/UI";
import { useCelebration } from "@/src/hooks/use-celebration";

export default function ValidateFeed() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState<string>("");
  const celebrate = useCelebration();

  const load = useCallback(async () => {
    try {
      const r = await api.get("/completions/pending");
      setItems(r.completions || []);
      const t = await storage.get("access_token");
      setToken(t || "");
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const vote = async (id: string, approved: boolean) => {
    try { await api.post(`/completions/${id}/vote`, { approved }); if (approved) celebrate(); await load(); } catch {}
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Valider les preuves</Text>
          <Text style={s.sub}>{items.length} en attente</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}>
        {items.length === 0
          ? <EmptyState emoji="✅" title="Toutes les preuves sont validées !" subtitle="Rien à faire pour l'instant" />
          : items.map((c: any) => {
              const canVote = c.user_id !== user?.id && c.my_vote === null;
              return (
                <View key={c.id} style={s.card} testID={`validation-${c.id}`}>
                  <View style={s.head}>
                    <Text style={{ fontSize: 32 }}>{c.user_avatar || "🧒"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.who}>{c.user_name}</Text>
                      <Text style={s.what}>{c.task_title} · +{c.points_worth} pts</Text>
                    </View>
                  </View>
                  {c.photo_path && (
                    <Image
                      testID={`photo-${c.id}`}
                      source={{ uri: `${BACKEND_URL}/api/photos/${c.photo_path}?token=${encodeURIComponent(token)}` }}
                      style={s.photo}
                      contentFit="cover"
                    />
                  )}
                  <View style={s.votesInfo}>
                    <Text style={s.voteCount}>✅ {c.votes.filter((v:any) => v.approved).length}</Text>
                    <Text style={s.voteCount}>❌ {c.votes.filter((v:any) => !v.approved).length}</Text>
                  </View>
                  {canVote ? (
                    <View style={s.actions}>
                      <Pressable testID={`reject-${c.id}`} onPress={() => vote(c.id, false)}
                        style={({ pressed }) => [s.btn, { backgroundColor: T.red, borderBottomColor: "#C93333" }, pressed && { opacity: 0.85 }]}>
                        <Ionicons name="close" size={18} color={T.white} />
                        <Text style={s.btnText}>Rejeter</Text>
                      </Pressable>
                      <Pressable testID={`approve-${c.id}`} onPress={() => vote(c.id, true)}
                        style={({ pressed }) => [s.btn, { backgroundColor: T.brand, borderBottomColor: T.brandDark }, pressed && { opacity: 0.85 }]}>
                        <Ionicons name="checkmark" size={18} color={T.white} />
                        <Text style={s.btnText}>Approuver</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={s.voted}>
                      {c.user_id === user?.id ? "Votre propre preuve" : c.my_vote ? "Vous avez approuvé" : "Vous avez rejeté"}
                    </Text>
                  )}
                </View>
              );
            })}
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
  card: { backgroundColor: T.white, borderRadius: R.lg, padding: S.md, borderWidth: 2, borderColor: T.border, gap: S.sm },
  head: { flexDirection: "row", alignItems: "center", gap: S.md },
  who: { fontWeight: "900", color: T.onSurface, fontSize: 16 },
  what: { color: T.onSurfaceMuted, fontSize: 13, marginTop: 2 },
  photo: { width: "100%", height: 260, borderRadius: R.md, backgroundColor: T.surfaceSecondary },
  votesInfo: { flexDirection: "row", gap: S.md },
  voteCount: { fontWeight: "900", fontSize: 14 },
  actions: { flexDirection: "row", gap: S.sm, marginTop: S.xs },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: R.pill, borderBottomWidth: 3 },
  btnText: { color: T.white, fontWeight: "900" },
  voted: { color: T.onSurfaceMuted, fontWeight: "700", textAlign: "center", padding: S.sm },
});
