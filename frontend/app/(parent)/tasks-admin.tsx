import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, TextInput, Modal, Switch, ActivityIndicator, Platform} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect,useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, storage } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";
import { useAuth } from "@/src/lib/auth";
import { ScreenHeader, EmptyState, Card } from "@/src/components/UI";
import ParentPinModal, { hasPinToken } from "@/src/components/ParentPinModal";
import { useCelebration } from "@/src/hooks/use-celebration";
import BadgeUnlockModal from "@/src/components/BadgeUnlockModal";
 
export default function TasksAdmin() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<any[]>([]);
  const [mytasks, setMyTasks] = useState<any[]>([]);
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"tasks" | "mytasks">("tasks");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [newBadges, setNewBadges] = useState<any[]>([]);
  const [paused, setPaused] = useState(false);
  const celebrate = useCelebration();
  const { user, refresh } = useAuth();
  const router = useRouter();
  const isParent = user?.role === "parent";
 
  const load = useCallback(async () => {
    try {
      const [t, f] = await Promise.all([api.get("/tasks"), api.get("/family")]);
      setTasks(t.tasks || []);
      setMembers(f.members || []);
      setMyTasks(t.tasks || []);
      setPaused(!!t.paused); 
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
 
  const resetForm = () => { setTitle(""); setPoints("20"); setPenalty("50"); setPhotoReq(true); setFreq("daily"); setSelected([]); setEditingId(null); };
 
  const mine = mytasks.filter((mt: any) => (mt.assigned_to?.length === 0) || mt.assigned_to.includes(user?.id));
  const todo = mine.filter(mt => mt.today_status === "todo");
  const done = mine.filter(mt => mt.today_status !== "todo");

  const complete = async (t: any) => {
      setBusyId(t.id);
      try {
        let r: any;
        if (t.photo_required) {
          const form = new FormData();
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          const res: any = perm.status === "granted"
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
          if (res.canceled) { setBusyId(null); return; }
          const asset = res.assets[0];
          const name = asset.fileName || `proof_${Date.now()}.jpg`;
          const type = asset.mimeType || "image/jpeg";
          if (Platform.OS === "web") { const blob = await (await fetch(asset.uri)).blob(); form.append("photo", blob, name); }
          else form.append("photo", { uri: asset.uri, name, type } as any);
          r = await api.upload(`/tasks/${t.id}/complete`, form);
        } else {
          r = await api.post(`/tasks/${t.id}/complete`);
        }
        celebrate();
        setFlash(r?.status === "approved" ? `🎉 +${t.points_worth} points` : "✅ Preuve envoyée, en attente de validation");
        if (r?.new_badges?.length) setNewBadges(r.new_badges);
        setTimeout(() => setFlash(null), 3000);
        await load(); await refresh();
      } catch (e: any) { setFlash(`❌ ${e.message}`); setTimeout(() => setFlash(null), 3000); }
      setBusyId(null);
    };
  
  const openCreate = async () => {
    resetForm();
    if (!(await hasPinToken())) setPinRequired(true);
    else setOpenAdd(true);
  };
 
  const openEdit = async (t: any) => {
    setEditingId(t.id); setTitle(t.title); setPoints(String(t.points_worth));
    setPenalty(String(t.penalty_points)); setPhotoReq(t.photo_required); setFreq(t.frequency);
    setSelected(t.assigned_to || []); setErr(null);
    if (!(await hasPinToken())) setPinRequired(true);
    else setOpenAdd(true);
  };
 
  const submit = async () => {
    setErr(null);
    const payload = { title, points_worth: parseInt(points) || 20, penalty_points: parseInt(penalty) || 0,
      frequency: freq, photo_required: photoReq, assigned_to: selected };
    try {
      if (editingId) await api.patch(`/tasks/${editingId}`, payload);
      else await api.post("/tasks", payload);
      setEditingId(null);resetForm(); setOpenAdd(false); await load();
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

  const pendingTasksCount = mytasks.filter(c => c.status === "pending").length;
 
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title="Tâches" subtitle="Configurez les corvées" 
        left={
          <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={T.onSurface} />
          </Pressable>
        }
        right={
          tab === "tasks" ? (
        <Pressable testID="open-add-task" onPress={openCreate} style={s.addBtn}>
          <Ionicons name="add" size={22} color={T.white} />
        </Pressable>
        ) : null
      } />

      {/* Tabs */}
      <View style={s.tabsWrap}>
        <Pressable
          testID="tab-tasks"
          onPress={() => setTab("tasks")}
          style={[s.tabItem, tab === "tasks" && s.tabItemActive]}
        >
          <Text style={[s.tabText, tab === "tasks" && s.tabTextActive]}>📦 Tâches ({tasks.length})</Text>
        </Pressable>
        <Pressable
          testID="tab-mytasks"
          onPress={() => setTab("mytasks")}
          style={[s.tabItem, tab === "mytasks" && s.tabItemActive]}
        >
          <Text style={[s.tabText, tab === "mytasks" && s.tabTextActive]}>
            🎁 Mes tâches {pendingTasksCount > 0 ? `(${pendingTasksCount})` : ""}
          </Text>
        </Pressable>
      </View>

      {tab === "tasks" ? (
        <>
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
              {isParent && (
                <Pressable testID={`edit-task-${t.id}`} onPress={() => openEdit(t)} style={{ padding: 4 }}>
                  <Ionicons name="create-outline" size={20} color={T.brand} />
                </Pressable>
              )}
              <Pressable testID={`del-task-${t.id}`} onPress={() => remove(t.id)}>
                <Ionicons name="trash-outline" size={22} color={T.red} />
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>
 
      <Modal visible={openAdd} transparent animationType="slide" onRequestClose={() => setOpenAdd(false)}>
        <View style={s.mBackdrop}>
          <View style={[s.mCard, { paddingBottom: insets.bottom + S.lg }]}>
            <ScrollView>
              <Text style={s.mTitle}>
                {editingId ? "Modifier la tâche" : "Nouvelle tâche"}
              </Text>
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
                <Pressable testID="save-task-button" style={s.saveBtn} onPress={submit}><Text style={{ fontWeight: "900", color: T.white }}>{editingId ? "Enregistrer" : "Créer"}</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ParentPinModal visible={pinRequired} onCancel={() => setPinRequired(false)} onSuccess={() => { setPinRequired(false); setOpenAdd(true); }} />
      </>
      ) : (
        <>
        {flash ? <View style={s.flash} testID="mytasks-flash"><Text style={s.flashText}>{flash}</Text></View> : null}
        
              {paused && (
                <View style={s.pausedBanner} testID="paused-banner">
                  <Text style={{ fontSize: 22 }}>🏖️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pausedTitle}>En pause</Text>
                    <Text style={s.pausedSub}>Aucune tâche ni pénalité pendant la pause.</Text>
                  </View>
                </View>
              )}
        
              <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.sm }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}>
                <Text style={s.section}>{"À faire aujourd'hui"}</Text>
                {todo.length === 0 && <EmptyState emoji="✨" title="Rien à faire !" subtitle="Aucune tâche en attente" />}
                {todo.map((t: any) => (
                  <Card key={t.id} testID={`mytask-${t.id}`}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                      <View style={s.icon}><Ionicons name={t.frequency === "weekly" ? "calendar" : "flame"} size={22} color={T.orange} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.tTitle}>{t.title}</Text>
                        <Text style={s.tSub}>{t.photo_required ? "📸 Photo requise" : "Simple"}</Text>
                      </View>
                      <View style={s.badge}><Text style={s.badgeText}>+{t.points_worth}</Text></View>
                    </View>
                    <Pressable testID={`mytask-complete-${t.id}`} onPress={() => complete(t)} disabled={busyId === t.id}
                      style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }, busyId === t.id && { opacity: 0.6 }]}>
                      {busyId === t.id ? <ActivityIndicator color={T.white} />
                        : <><Ionicons name={t.photo_required ? "camera" : "checkmark"} size={18} color={T.white} />
                            <Text style={s.ctaText}>{t.photo_required ? "Envoyer une preuve" : "Marquer fait"}</Text></>}
                    </Pressable>
                  </Card>
                ))}
        
                {done.length > 0 && <Text style={s.section}>Déjà fait</Text>}
                {done.map((t: any) => (
                  <View key={t.id} style={s.doneRow} testID={`mytask-done-${t.id}`}>
                    <Ionicons name="checkmark-circle" size={20} color={T.brand} />
                    <Text style={s.doneText}>{t.title}</Text>
                    <Text style={s.doneStatus}>{t.today_status === "pending" ? "⏳" : t.today_status === "approved" ? "✅" : "❌"}</Text>
                  </View>
                ))}
              </ScrollView>
              <BadgeUnlockModal badges={newBadges} onClose={() => setNewBadges([])} />
        </>
      )}
      
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.orange, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: "#C77500" },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: T.white, borderWidth: 2, borderColor: T.border },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "900", fontSize: 15, color: T.onSurface },
  sub: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  tabsWrap: { flexDirection: "row", marginHorizontal: S.lg, marginBottom: S.sm, backgroundColor: T.surfaceSecondary, borderRadius: R.pill, padding: 4 },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: R.pill },
  tabItemActive: { backgroundColor: T.white, shadowColor: T.shadow, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontWeight: "800", fontSize: 13, color: T.onSurfaceMuted },
  tabTextActive: { color: T.onSurface, fontWeight: "900" },
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
  header: { flexDirection: "row", padding: S.lg, gap: S.sm, alignItems: "center" },
  flash: { marginHorizontal: S.lg, padding: S.md, backgroundColor: "#EFFBE0", borderRadius: R.md, borderWidth: 2, borderColor: T.brand },
  flashText: { color: T.onSurface, fontWeight: "800" },
  section: { fontWeight: "900", color: T.onSurfaceMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: S.sm },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  tTitle: { fontSize: 15, fontWeight: "900", color: T.onSurface },
  tSub: { fontSize: 12, color: T.onSurfaceMuted, marginTop: 2 },
  badge: { backgroundColor: T.gold, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill },
  badgeText: { fontWeight: "900", color: T.onSurface, fontSize: 13 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: S.md, backgroundColor: T.brand, paddingVertical: 12, borderRadius: R.pill, borderBottomWidth: 4, borderBottomColor: T.brandDark },
  ctaText: { color: T.white, fontWeight: "900", fontSize: 14 },
  doneRow: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: T.white, padding: S.md, borderRadius: R.md, borderWidth: 2, borderColor: T.border },
  doneText: { flex: 1, fontWeight: "700", color: T.onSurfaceMuted, textDecorationLine: "line-through" },
  doneStatus: { fontSize: 16 },
  pausedBanner: { flexDirection: "row", alignItems: "center", gap: S.md, marginHorizontal: S.lg, marginTop: S.sm, padding: S.md, backgroundColor: "#E3F2FD", borderRadius: R.lg, borderWidth: 2, borderColor: "#64B5F6" },
  pausedTitle: { fontWeight: "900", color: T.onSurface, fontSize: 15 },
  pausedSub: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 2 },
});
