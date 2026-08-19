import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { EmptyState, Card, PointsPill } from "@/src/components/UI";
import { useCelebration } from "@/src/hooks/use-celebration";
import BadgeUnlockModal from "@/src/components/BadgeUnlockModal";

export default function MyTasks() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [newBadges, setNewBadges] = useState<any[]>([]);
  const celebrate = useCelebration();

  const load = useCallback(async () => {
    try { const t = await api.get("/tasks"); setTasks(t.tasks || []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); await refresh(); setRefreshing(false); };

  const mine = tasks.filter((t: any) => (t.assigned_to?.length === 0) || t.assigned_to.includes(user?.id));
  const todo = mine.filter(t => t.today_status === "todo");
  const done = mine.filter(t => t.today_status !== "todo");

  const complete = async (t: any) => {
    setBusyId(t.id);
    try {
      const form = new FormData();
      if (t.photo_required) {
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
      }
      const r = await api.upload(`/tasks/${t.id}/complete`, form);
      celebrate();
      setFlash(r?.status === "approved" ? `🎉 +${t.points_worth} points` : "✅ Preuve envoyée, en attente de validation");
      if (r?.new_badges?.length) setNewBadges(r.new_badges);
      setTimeout(() => setFlash(null), 3000);
      await load(); await refresh();
    } catch (e: any) { setFlash(`❌ ${e.message}`); setTimeout(() => setFlash(null), 3000); }
    setBusyId(null);
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Mes tâches</Text>
          <Text style={s.sub}>Participez et gagnez des points</Text>
        </View>
        {user ? <PointsPill value={user.points} /> : null}
      </View>

      {flash ? <View style={s.flash} testID="mytasks-flash"><Text style={s.flashText}>{flash}</Text></View> : null}

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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  header: { flexDirection: "row", padding: S.lg, gap: S.sm, alignItems: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: T.white, borderWidth: 2, borderColor: T.border },
  title: { fontSize: 22, fontWeight: "900", color: T.onSurface },
  sub: { color: T.onSurfaceMuted, fontSize: 13 },
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
});
