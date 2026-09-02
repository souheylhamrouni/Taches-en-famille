import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader, EmptyState, Card } from "@/src/components/UI";
import { useCelebration } from "@/src/hooks/use-celebration";
import BadgeUnlockModal from "@/src/components/BadgeUnlockModal";

const FILTERS = [
  { id: "todo", label: "À faire" },
  { id: "claimed", label: "Réclamées" },
  { id: "pending", label: "En attente" },
  { id: "approved", label: "Validées" },
  { id: "rejected", label: "Rejetées" },
];

export default function KidTasks() {
  const { user, refresh } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("todo");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [newBadges, setNewBadges] = useState<any[]>([]);
  const [paused, setPaused] = useState(false);
  const celebrate = useCelebration();

  const load = useCallback(async () => {
    try { const t = await api.get("/tasks"); setTasks(t.tasks || []); setPaused(!!t.paused); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const mine = tasks.filter((t: any) => t.assigned_to?.length === 0 || t.assigned_to.includes(user?.id));
  const filtered = mine.filter((t: any) => t.today_status === filter);

  const complete = async (t: any) => {
    setBusyId(t.id);
    try {
      let res: any;
      if (t.photo_required) {
        const form = new FormData();
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        let pick: any;
        if (perm.status === "granted") {
          pick = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
        } else {
          pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
        }
        if (pick.canceled) { setBusyId(null); return; }
        const asset = pick.assets[0];
        const name = asset.fileName || `proof_${Date.now()}.jpg`;
        const type = asset.mimeType || "image/jpeg";
        if (Platform.OS === "web") {
          const blob = await (await fetch(asset.uri)).blob();
          form.append("photo", blob, name);
        } else {
          form.append("photo", { uri: asset.uri, name, type } as any);
        }
        res = await api.upload(`/tasks/${t.id}/complete`, form);
      } else {
        res = await api.post(`/tasks/${t.id}/complete`);
      }
      celebrate();
      const status = res?.status;
      setFlash(status === "approved"
        ? `🎉 Bravo ! +${t.points_worth} points`
        : "✅ Preuve envoyée ! En attente de validation tribu");
      setTimeout(() => setFlash(null), 3000);
      if (res?.new_badges?.length) setNewBadges(res.new_badges);
      await load();
      await refresh();
    } catch (e: any) {
      setFlash(`❌ ${e.message}`);
      setTimeout(() => setFlash(null), 3000);
    }
    setBusyId(null);
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title="Mes tâches" subtitle={`${mine.length} au total`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chipContent}>
        {FILTERS.map((f) => {
          const count = mine.filter(t => t.today_status === f.id).length;
          const active = filter === f.id;
          return (
            <Pressable key={f.id} testID={`filter-${f.id}`} onPress={() => setFilter(f.id)}
              style={[s.chip, active && s.chipActive]}>
              <Text style={[s.chipText, active && s.chipTextActive]}>{f.label} · {count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {flash ? <View style={s.flash} testID="flash-message"><Text style={s.flashText}>{flash}</Text></View> : null}

      {paused && (
        <View style={s.pausedBanner} testID="paused-banner">
          <Text style={{ fontSize: 22 }}>🏖️</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.pausedTitle}>En pause</Text>
            <Text style={s.pausedSub}>{"Profite de ta pause ! Aucune tâche ni pénalité aujourd'hui."}</Text>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}
      >
        {filtered.length === 0 && (
          <EmptyState emoji="✨" title="Rien ici !"
            subtitle={filter === "todo" ? "Tout est fait pour aujourd'hui" : "Aucune tâche dans cet état"} />
        )}
        {filtered.map((t: any) => (
          <Card key={t.id} testID={`task-card-${t.id}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
              <View style={s.iconWrap}>
                <Ionicons name={t.frequency === "weekly" ? "calendar" : "flame"} size={22} color={T.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.taskTitle}>{t.title}</Text>
                <Text style={s.taskSub}>
                  {t.frequency === "daily" ? "Quotidien" : t.frequency === "weekly" ? "Hebdomadaire" : "Ponctuel"}
                  {t.photo_required ? " · 📸" : ""}
                </Text>
              </View>
              <View style={s.pointsBadge}><Text style={s.pointsBadgeText}>+{t.points_worth}</Text></View>
            </View>
            {filter === "todo" && (
              <Pressable
                testID={`complete-${t.id}`}
                onPress={() => complete(t)}
                disabled={busyId === t.id}
                style={({ pressed }) => [s.completeBtn, pressed && { opacity: 0.9 }, busyId === t.id && { opacity: 0.6 }]}
              >
                {busyId === t.id
                  ? <ActivityIndicator color={T.white} />
                  : <>
                      <Ionicons name={t.photo_required ? "camera" : "checkmark"} size={18} color={T.white} />
                      <Text style={s.completeText}>{t.photo_required ? "Envoyer une preuve" : "Marquer fait"}</Text>
                    </>}
              </Pressable>
            )}
            {filter === "claimed" && (
              <Text style={s.claimed}>
                🤝 Réclamée par {t.shared_claim?.claimed_by_name || "quelqu'un"} — pas besoin de la faire !
              </Text>
            )}
            {filter === "pending" && <Text style={s.pending}>⏳ En attente du vote de la tribu</Text>}
            {filter === "rejected" && <Text style={s.rejected}>❌ Preuve rejetée</Text>}
            {filter === "approved" && <Text style={s.approved}>✅ Validée · +{t.points_worth} pts</Text>}
          </Card>
        ))}
      </ScrollView>
      <BadgeUnlockModal badges={newBadges} onClose={() => setNewBadges([])} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  chipRow: { maxHeight: 56 },
  chipContent: { paddingHorizontal: S.lg, gap: S.sm, alignItems: "center", height: 56 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 2, borderColor: T.border, backgroundColor: T.white, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: T.brand, borderColor: T.brandDark },
  chipText: { fontWeight: "800", color: T.onSurface, fontSize: 12 },
  chipTextActive: { color: T.white },
  flash: { margin: S.lg, padding: S.md, backgroundColor: "#EFFBE0", borderRadius: R.md, borderWidth: 2, borderColor: T.brand },
  flashText: { color: T.onSurface, fontWeight: "800" },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  taskTitle: { fontSize: 15, fontWeight: "900", color: T.onSurface },
  taskSub: { fontSize: 12, color: T.onSurfaceMuted, marginTop: 2 },
  pointsBadge: { backgroundColor: T.gold, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill },
  pointsBadgeText: { fontWeight: "900", color: T.onSurface, fontSize: 13 },
  completeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: S.md, backgroundColor: T.brand, paddingVertical: 12, borderRadius: R.pill, borderBottomWidth: 4, borderBottomColor: T.brandDark },
  completeText: { color: T.white, fontWeight: "900", fontSize: 14 },
  pending: { marginTop: S.md, color: T.orange, fontWeight: "800" },
  claimed: { marginTop: S.md, color: T.brand, fontWeight: "800" },
  rejected: { marginTop: S.md, color: T.red, fontWeight: "800" },
  approved: { marginTop: S.md, color: T.brand, fontWeight: "800" },
  pausedBanner: { flexDirection: "row", alignItems: "center", gap: S.md, margin: S.lg, marginBottom: 0, padding: S.md, backgroundColor: "#E3F2FD", borderRadius: R.lg, borderWidth: 2, borderColor: "#64B5F6" },
  pausedTitle: { fontWeight: "900", color: T.onSurface, fontSize: 15 },
  pausedSub: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 2 },
});
