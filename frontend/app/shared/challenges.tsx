import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, storage } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { EmptyState } from "@/src/components/UI";
import ParentPinModal, { hasPinToken } from "@/src/components/ParentPinModal";

export default function Challenges() {
  const router = useRouter();
  const { user } = useAuth();
  const isParent = user?.role === "parent";
  const [challenge, setChallenge] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<"tasks" | "points">("tasks");
  const [target, setTarget] = useState("15");
  const [bonus, setBonus] = useState("50");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/challenges");
      setChallenge(r.challenge || null);
      setHistory(r.history || []);
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
      await api.post("/challenges", { title, metric, target: parseInt(target) || 15, bonus_points: parseInt(bonus) || 50 });
      setTitle(""); setTarget("15"); setBonus("50"); setMetric("tasks"); setOpenAdd(false); await load();
    } catch (e: any) {
      if (String(e.message).includes("PIN")) { await storage.del("parent_pin_token"); setOpenAdd(false); setPinRequired(true); }
      else setErr(e.message);
    }
  };

  const remove = async () => {
    if (!challenge) return;
    if (!(await hasPinToken())) { setPinRequired(true); return; }
    try { await api.del(`/challenges/${challenge.id}`); await load(); }
    catch (e: any) { if (String(e.message).includes("PIN")) { await storage.del("parent_pin_token"); setPinRequired(true); } }
  };

  const pct = challenge ? Math.round((challenge.percent || 0) * 100) : 0;
  const done = challenge?.status === "completed";

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Défi familial</Text>
          <Text style={s.sub}>{"Objectif d'équipe hebdomadaire"}</Text>
        </View>
        {isParent && !challenge && (
          <Pressable testID="open-add-challenge" onPress={openCreate} style={s.addBtn}>
            <Ionicons name="add" size={22} color={T.white} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}>

        {!challenge ? (
          <EmptyState emoji="🎯" title="Aucun défi cette semaine"
            subtitle={isParent ? "Crée un défi d'équipe avec le bouton +" : "Un parent doit lancer un défi"} />
        ) : (
          <View style={[s.card, done && { borderColor: T.gold, backgroundColor: "#FFFBEA" }]} testID="challenge-card">
            <View style={s.cardTop}>
              <Text style={{ fontSize: 40 }}>{done ? "🏆" : "🎯"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.cTitle}>{challenge.title}</Text>
                {challenge.description ? <Text style={s.cDesc}>{challenge.description}</Text> : null}
              </View>
              {isParent && (
                <Pressable testID="delete-challenge" onPress={remove}>
                  <Ionicons name="trash-outline" size={20} color={T.onSurfaceMuted} />
                </Pressable>
              )}
            </View>

            <View style={s.progressHead}>
              <Text style={s.progressText} testID="challenge-progress">
                {challenge.progress} / {challenge.target} {challenge.metric === "points" ? "points" : "tâches"}
              </Text>
              <Text style={[s.pctText, done && { color: T.gold }]}>{pct}%</Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.min(100, pct)}%`, backgroundColor: done ? T.gold : T.brand }]} />
            </View>

            <View style={s.bonusRow}>
              <Ionicons name="gift" size={18} color={T.orange} />
              <Text style={s.bonusText}>Récompense : +{challenge.bonus_points} points pour chaque enfant</Text>
            </View>

            {done ? (
              <View style={s.doneBanner}>
                <Text style={s.doneBannerText}>🎉 Défi réussi ! Bonus distribué à toute la famille</Text>
              </View>
            ) : (
              <Text style={s.hintText}>{"💪 Continuez à valider des tâches ensemble pour atteindre l'objectif !"}</Text>
            )}
          </View>
        )}

        {history.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>🏅 Défis réussis</Text>
            {history.map(h => (
              <View key={h.id} style={s.histRow} testID={`history-${h.id}`}>
                <Text style={{ fontSize: 22 }}>🏆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.histTitle}>{h.title}</Text>
                  <Text style={s.histSub}>Semaine du {h.week_start} · +{h.bonus_points} pts</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={openAdd} transparent animationType="slide" onRequestClose={() => setOpenAdd(false)}>
        <View style={s.mBackdrop}>
          <View style={s.mCard}>
            <Text style={s.mTitle}>Nouveau défi</Text>
            <TextInput testID="challenge-title-input" value={title} onChangeText={setTitle}
              placeholder="Ex: Semaine au top" placeholderTextColor={T.onSurfaceMuted} style={s.input} />
            <Text style={s.label}>Objectif basé sur</Text>
            <View style={{ flexDirection: "row", gap: S.sm }}>
              <Pressable testID="metric-tasks" onPress={() => setMetric("tasks")} style={[s.chip, metric === "tasks" && s.chipActive]}>
                <Text style={[s.chipText, metric === "tasks" && s.chipTextActive]}>Tâches terminées</Text>
              </Pressable>
              <Pressable testID="metric-points" onPress={() => setMetric("points")} style={[s.chip, metric === "points" && s.chipActive]}>
                <Text style={[s.chipText, metric === "points" && s.chipTextActive]}>Points gagnés</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: S.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Objectif</Text>
                <TextInput testID="challenge-target-input" value={target} onChangeText={setTarget} keyboardType="number-pad" style={s.input} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Bonus / enfant</Text>
                <TextInput testID="challenge-bonus-input" value={bonus} onChangeText={setBonus} keyboardType="number-pad" style={s.input} />
              </View>
            </View>
            {err ? <Text style={{ color: T.red, fontWeight: "700", marginTop: S.sm }}>{err}</Text> : null}
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
              <Pressable style={s.cancelBtn} onPress={() => setOpenAdd(false)}><Text style={{ fontWeight: "800", color: T.onSurfaceMuted }}>Annuler</Text></Pressable>
              <Pressable testID="save-challenge-button" style={s.saveBtn} onPress={submit}><Text style={{ fontWeight: "900", color: T.white }}>Lancer le défi</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ParentPinModal visible={pinRequired} onCancel={() => setPinRequired(false)} onSuccess={() => { setPinRequired(false); setOpenAdd(true); }} />
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
  card: { backgroundColor: T.white, borderRadius: R.lg, padding: S.lg, borderWidth: 2, borderColor: T.border, gap: S.md },
  cardTop: { flexDirection: "row", alignItems: "center", gap: S.md },
  cTitle: { fontWeight: "900", fontSize: 18, color: T.onSurface },
  cDesc: { color: T.onSurfaceMuted, fontSize: 13, marginTop: 2 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  progressText: { fontWeight: "800", color: T.onSurface, fontSize: 15 },
  pctText: { fontWeight: "900", color: T.brand, fontSize: 18 },
  track: { height: 18, backgroundColor: T.surfaceSecondary, borderRadius: R.pill, overflow: "hidden", borderWidth: 2, borderColor: T.border },
  fill: { height: "100%", borderRadius: R.pill },
  bonusRow: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: "#FFF3E0", padding: S.md, borderRadius: R.md },
  bonusText: { color: T.onSurface, fontWeight: "700", fontSize: 13, flex: 1 },
  hintText: { color: T.onSurfaceMuted, fontWeight: "600", fontSize: 13, textAlign: "center" },
  doneBanner: { backgroundColor: T.gold, padding: S.md, borderRadius: R.md },
  doneBannerText: { color: T.onSurface, fontWeight: "900", textAlign: "center", fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: T.onSurface, marginBottom: S.sm },
  histRow: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, borderColor: T.border, marginBottom: S.sm },
  histTitle: { fontWeight: "900", color: T.onSurface, fontSize: 15 },
  histSub: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  mBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,26,26,0.6)" },
  mCard: { backgroundColor: T.white, padding: S.lg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, gap: S.sm },
  mTitle: { fontWeight: "900", fontSize: 20, color: T.onSurface, marginBottom: S.sm },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border, marginTop: 4 },
  label: { fontWeight: "800", color: T.onSurface, fontSize: 13, marginTop: S.md },
  chip: { flex: 1, paddingVertical: 12, borderRadius: R.pill, borderWidth: 2, borderColor: T.border, backgroundColor: T.white, alignItems: "center" },
  chipActive: { backgroundColor: T.brand, borderColor: T.brandDark },
  chipText: { fontWeight: "800", color: T.onSurface, fontSize: 12 },
  chipTextActive: { color: T.white },
  cancelBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.surfaceSecondary },
  saveBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.brand, borderBottomWidth: 3, borderBottomColor: T.brandDark },
});
