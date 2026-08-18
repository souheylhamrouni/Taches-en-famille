import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, TextInput, Modal, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, storage } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader, EmptyState, Card } from "@/src/components/UI";
import ParentPinModal, { hasPinToken } from "@/src/components/ParentPinModal";

export default function TasksAdmin() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState("20");
  const [penalty, setPenalty] = useState("50");
  const [photoReq, setPhotoReq] = useState(true);
  const [freq, setFreq] = useState<"daily" | "weekly" | "once">("daily");
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, f] = await Promise.all([api.get("/tasks"), api.get("/family")]);
      setTasks(t.tasks || []);
      setMembers((f.members || []).filter((m: any) => m.role === "child"));
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openCreate = async () => {
    if (!(await hasPinToken())) setPinRequired(true);
    else setOpenAdd(true);
  };

  const submit = async () => {
    setErr(null);
    try {
      await api.post("/tasks", {
        title, points_worth: parseInt(points) || 20, penalty_points: parseInt(penalty) || 0,
        frequency: freq, photo_required: photoReq, assigned_to: selected,
      });
      setTitle(""); setPoints("20"); setPenalty("50"); setPhotoReq(true);
      setFreq("daily"); setSelected([]); setOpenAdd(false); await load();
    } catch (e: any) {
      if (String(e.message).includes("PIN")) { await storage.del("parent_pin_token"); setOpenAdd(false); setPinRequired(true); }
      else setErr(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!(await hasPinToken())) { setPinRequired(true); return; }
    try { await api.del(`/tasks/${id}`); await load(); }
    catch (e: any) { if (String(e.message).includes("PIN")) { await storage.del("parent_pin_token"); setPinRequired(true); } }
  };

  const toggleMember = (id: string) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title="Tâches" subtitle="Configurez les corvées" right={
        <Pressable testID="open-add-task" onPress={openCreate} style={s.addBtn}>
          <Ionicons name="add" size={22} color={T.white} />
        </Pressable>
      } />
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.orange} />}>
        {tasks.filter(t => t.active !== false).length === 0 && <EmptyState emoji="📋" title="Aucune tâche" subtitle="Créez la première avec le +" />}
        {tasks.filter(t => t.active !== false).map(t => (
          <Card key={t.id} testID={`admin-task-${t.id}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <View style={s.iconWrap}><Ionicons name={t.frequency === "weekly" ? "calendar" : "flame"} size={22} color={T.orange} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{t.title}</Text>
                <Text style={s.sub}>+{t.points_worth} pts · -{t.penalty_points} pén. · {t.frequency}</Text>
              </View>
              <Pressable testID={`del-task-${t.id}`} onPress={() => remove(t.id)}>
                <Ionicons name="trash-outline" size={22} color={T.red} />
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>

      <Modal visible={openAdd} transparent animationType="slide" onRequestClose={() => setOpenAdd(false)}>
        <View style={s.mBackdrop}>
          <View style={s.mCard}>
            <ScrollView>
              <Text style={s.mTitle}>Nouvelle tâche</Text>
              <TextInput testID="task-title-input" value={title} onChangeText={setTitle} placeholder="Titre" placeholderTextColor={T.onSurfaceMuted} style={s.input} />
              <View style={{ flexDirection: "row", gap: S.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Points +</Text>
                  <TextInput testID="task-points-input" value={points} onChangeText={setPoints} keyboardType="number-pad" style={s.input} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Pénalité -</Text>
                  <TextInput testID="task-penalty-input" value={penalty} onChangeText={setPenalty} keyboardType="number-pad" style={s.input} />
                </View>
              </View>
              <Text style={s.label}>Fréquence</Text>
              <View style={{ flexDirection: "row", gap: S.sm }}>
                {(["daily", "weekly", "once"] as const).map(f => (
                  <Pressable key={f} testID={`freq-${f}`} onPress={() => setFreq(f)} style={[s.chip, freq === f && s.chipActive]}>
                    <Text style={[s.chipText, freq === f && s.chipTextActive]}>{f === "daily" ? "Quotidien" : f === "weekly" ? "Hebdo" : "Ponctuel"}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={s.switchRow}>
                <Text style={{ fontWeight: "800", color: T.onSurface }}>📸 Photo requise</Text>
                <Switch testID="task-photo-switch" value={photoReq} onValueChange={setPhotoReq} trackColor={{ true: T.brand, false: T.borderStrong }} />
              </View>
              <Text style={s.label}>Assigné à (vide = tous)</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                {members.map(m => (
                  <Pressable key={m.id} testID={`assign-${m.id}`} onPress={() => toggleMember(m.id)} style={[s.chip, selected.includes(m.id) && s.chipActive]}>
                    <Text style={[s.chipText, selected.includes(m.id) && s.chipTextActive]}>{m.avatar} {m.name}</Text>
                  </Pressable>
                ))}
              </View>
              {err ? <Text style={{ color: T.red, fontWeight: "700", marginTop: S.sm }}>{err}</Text> : null}
              <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
                <Pressable style={s.cancelBtn} onPress={() => setOpenAdd(false)}><Text style={{ fontWeight: "800", color: T.onSurfaceMuted }}>Annuler</Text></Pressable>
                <Pressable testID="save-task-button" style={s.saveBtn} onPress={submit}><Text style={{ fontWeight: "900", color: T.white }}>Créer</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ParentPinModal visible={pinRequired} onCancel={() => setPinRequired(false)} onSuccess={() => { setPinRequired(false); setOpenAdd(true); }} />
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.orange, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: "#C77500" },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "900", fontSize: 15, color: T.onSurface },
  sub: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  mBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,26,26,0.6)" },
  mCard: { backgroundColor: T.white, padding: S.lg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, maxHeight: "88%" },
  mTitle: { fontWeight: "900", fontSize: 22, color: T.onSurface, marginBottom: S.md },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border, marginTop: 4 },
  label: { fontWeight: "800", color: T.onSurface, fontSize: 13, marginTop: S.md },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.pill, borderWidth: 2, borderColor: T.border, backgroundColor: T.white },
  chipActive: { backgroundColor: T.brand, borderColor: T.brandDark },
  chipText: { fontWeight: "800", color: T.onSurface, fontSize: 12 },
  chipTextActive: { color: T.white },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.md, padding: S.sm },
  cancelBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.surfaceSecondary },
  saveBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.brand, borderBottomWidth: 3, borderBottomColor: T.brandDark },
});
