import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { EmptyState } from "@/src/components/UI";

export default function Members() {
  const router = useRouter();
  const { user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/family");
      setFamily(r.family);
      const list = (r.members || []).slice().sort((a: any, b: any) => {
        if (a.role !== b.role) return a.role === "parent" ? -1 : 1;
        return (b.points || 0) - (a.points || 0);
      });
      setMembers(list);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const parents = members.filter(m => m.role === "parent");
  const kids = members.filter(m => m.role === "child");

  const Row = ({ m }: { m: any }) => (
    <View style={s.row} testID={`member-${m.id}`}>
      <Text style={{ fontSize: 32 }}>{m.avatar}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>
          {m.name}{m.id === user?.id ? " (moi)" : ""}
        </Text>
        <Text style={s.role}>{m.role === "parent" ? "👑 Adulte" : "🧒 Enfant"}</Text>
      </View>
      {m.role === "child" && (
        <View style={s.stats}>
          <Text style={s.points}>⭐ {m.points}</Text>
          <Text style={s.streak}>🔥 {m.streak}</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Membres</Text>
          <Text style={s.sub}>{family?.name || "Ma tribu"} · {members.length} membre(s)</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}>
        {members.length === 0 && <EmptyState emoji="👨‍👩‍👧‍👦" title="Aucun membre" />}

        {parents.length > 0 && <Text style={s.section}>Adultes</Text>}
        {parents.map(m => <Row key={m.id} m={m} />)}

        {kids.length > 0 && <Text style={s.section}>Enfants</Text>}
        {kids.map(m => <Row key={m.id} m={m} />)}

        {family && (
          <View style={s.codeCard}>
            <Text style={s.codeTitle}>🏠 Code tribu</Text>
            <Text style={s.codeHelp}>{"Partagez ce code pour rattacher un enfant ou un second adulte."}</Text>
            <Text style={s.code} selectable>{family.id}</Text>
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
  section: { fontWeight: "900", color: T.onSurfaceMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: S.md },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, borderColor: T.border },
  name: { fontWeight: "900", color: T.onSurface, fontSize: 16 },
  role: { color: T.onSurfaceMuted, fontSize: 13, marginTop: 2 },
  stats: { alignItems: "flex-end" },
  points: { fontWeight: "900", color: T.onSurface },
  streak: { color: T.orange, fontWeight: "800", fontSize: 12, marginTop: 2 },
  codeCard: { backgroundColor: T.surfaceSecondary, borderRadius: R.lg, padding: S.lg, borderWidth: 2, borderColor: T.border, marginTop: S.lg },
  codeTitle: { fontWeight: "900", fontSize: 15, color: T.onSurface },
  codeHelp: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 4 },
  code: { fontWeight: "800", color: T.onSurface, fontSize: 13, marginTop: S.sm, backgroundColor: T.white, padding: S.md, borderRadius: R.md, borderWidth: 2, borderColor: T.border },
});
