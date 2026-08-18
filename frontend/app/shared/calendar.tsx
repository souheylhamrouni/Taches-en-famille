import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";
import { EmptyState } from "@/src/components/UI";

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(iso: string) {
  const d = new Date(iso); return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function Calendar() {
  const router = useRouter();
  const [events, setEvents] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get("/events"); setEvents(r.events || []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const add = async () => {
    setErr(null);
    try {
      const start = when ? new Date(when).toISOString() : new Date().toISOString();
      await api.post("/events", { title, start_time: start });
      setTitle(""); setWhen(""); setOpenAdd(false); await load();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Calendrier</Text>
          <Text style={s.sub}>{events.length} événement(s)</Text>
        </View>
        <Pressable testID="open-add-event" onPress={() => setOpenAdd(true)} style={s.addBtn}>
          <Ionicons name="add" size={22} color={T.white} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}>
        {events.length === 0 && <EmptyState emoji="📅" title="Aucun événement" subtitle="Ajoute le premier avec le +" />}
        {events.map(e => (
          <View key={e.id} style={s.card} testID={`event-${e.id}`}>
            <View style={[s.stripe, { backgroundColor: e.color || T.brand }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.eTitle}>{e.title}</Text>
              <Text style={s.eSub}>📅 {fmt(e.start_time)} · {fmtTime(e.start_time)}</Text>
            </View>
            <Pressable testID={`del-event-${e.id}`} onPress={async () => { await api.del(`/events/${e.id}`); await load(); }}>
              <Ionicons name="trash-outline" size={20} color={T.onSurfaceMuted} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Modal visible={openAdd} transparent animationType="slide" onRequestClose={() => setOpenAdd(false)}>
        <View style={s.mBackdrop}>
          <View style={s.mCard}>
            <Text style={s.mTitle}>Nouvel événement</Text>
            <TextInput testID="event-title-input" value={title} onChangeText={setTitle}
              placeholder="Titre" placeholderTextColor={T.onSurfaceMuted} style={s.input} />
            <TextInput testID="event-date-input" value={when} onChangeText={setWhen}
              placeholder="AAAA-MM-JJ HH:MM (facultatif)" placeholderTextColor={T.onSurfaceMuted}
              style={s.input} autoCapitalize="none" />
            {err ? <Text style={{ color: T.red, fontWeight: "700" }}>{err}</Text> : null}
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
              <Pressable style={s.cancelBtn} onPress={() => setOpenAdd(false)}><Text style={{ fontWeight: "800", color: T.onSurfaceMuted }}>Annuler</Text></Pressable>
              <Pressable testID="save-event-button" style={s.saveBtn} onPress={add}><Text style={{ fontWeight: "900", color: T.white }}>Enregistrer</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  header: { flexDirection: "row", padding: S.lg, gap: S.sm, alignItems: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: T.white, borderWidth: 2, borderColor: T.border },
  title: { fontSize: 22, fontWeight: "900", color: T.onSurface },
  sub: { color: T.onSurfaceMuted, fontSize: 13 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.brand, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: T.brandDark },
  card: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, borderColor: T.border },
  stripe: { width: 6, height: 40, borderRadius: 3 },
  eTitle: { fontWeight: "900", color: T.onSurface, fontSize: 15 },
  eSub: { color: T.onSurfaceMuted, fontSize: 13, marginTop: 2 },
  mBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,26,26,0.6)" },
  mCard: { backgroundColor: T.white, padding: S.lg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, gap: S.sm },
  mTitle: { fontWeight: "900", fontSize: 20, color: T.onSurface, marginBottom: S.sm },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border },
  cancelBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.surfaceSecondary },
  saveBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.brand, borderBottomWidth: 3, borderBottomColor: T.brandDark },
});
