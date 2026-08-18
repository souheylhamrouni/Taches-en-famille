import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, storage } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader, EmptyState, Card } from "@/src/components/UI";
import ParentPinModal, { hasPinToken } from "@/src/components/ParentPinModal";

const ICONS = ["🎮", "🎬", "🍦", "🍕", "🛌", "💶", "🎁", "🚴", "📚"];

export default function RewardsAdmin() {
  const [rewards, setRewards] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("100");
  const [icon, setIcon] = useState("🎁");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get("/rewards"); setRewards(r.rewards || []); } catch {}
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
      await api.post("/rewards", { title, point_cost: parseInt(cost) || 100, icon });
      setTitle(""); setCost("100"); setIcon("🎁"); setOpenAdd(false); await load();
    } catch (e: any) {
      if (String(e.message).includes("PIN")) { await storage.del("parent_pin_token"); setOpenAdd(false); setPinRequired(true); }
      else setErr(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!(await hasPinToken())) { setPinRequired(true); return; }
    try { await api.del(`/rewards/${id}`); await load(); }
    catch (e: any) { if (String(e.message).includes("PIN")) { await storage.del("parent_pin_token"); setPinRequired(true); } }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title="Récompenses" subtitle="Catalogue de la boutique" right={
        <Pressable testID="open-add-reward" onPress={openCreate} style={s.addBtn}>
          <Ionicons name="add" size={22} color={T.white} />
        </Pressable>
      } />
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.sm, paddingBottom: S.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.orange} />}>
        {rewards.length === 0 && <EmptyState emoji="🎁" title="Aucune récompense" subtitle="Ajoute-en avec le bouton +" />}
        {rewards.map(r => (
          <Card key={r.id} testID={`admin-reward-${r.id}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
              <Text style={{ fontSize: 36 }}>{r.icon || "🎁"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{r.title}</Text>
                <Text style={s.sub}>{r.point_cost} points</Text>
              </View>
              <Pressable testID={`del-reward-${r.id}`} onPress={() => remove(r.id)}>
                <Ionicons name="trash-outline" size={22} color={T.red} />
              </Pressable>
            </View>
          </Card>
        ))}
      </ScrollView>

      <Modal visible={openAdd} transparent animationType="slide" onRequestClose={() => setOpenAdd(false)}>
        <View style={s.mBackdrop}>
          <View style={s.mCard}>
            <Text style={s.mTitle}>Nouvelle récompense</Text>
            <TextInput testID="reward-title-input" value={title} onChangeText={setTitle} placeholder="Ex: Sortie ciné" placeholderTextColor={T.onSurfaceMuted} style={s.input} />
            <Text style={s.label}>Coût en points</Text>
            <TextInput testID="reward-cost-input" value={cost} onChangeText={setCost} keyboardType="number-pad" style={s.input} />
            <Text style={s.label}>Icône</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {ICONS.map(i => (
                <Pressable key={i} testID={`icon-${i}`} onPress={() => setIcon(i)}
                  style={[s.iconBtn, icon === i && s.iconBtnActive]}>
                  <Text style={{ fontSize: 22 }}>{i}</Text>
                </Pressable>
              ))}
            </View>
            {err ? <Text style={{ color: T.red, fontWeight: "700", marginTop: S.sm }}>{err}</Text> : null}
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
              <Pressable style={s.cancelBtn} onPress={() => setOpenAdd(false)}><Text style={{ fontWeight: "800", color: T.onSurfaceMuted }}>Annuler</Text></Pressable>
              <Pressable testID="save-reward-button" style={s.saveBtn} onPress={submit}><Text style={{ fontWeight: "900", color: T.white }}>Créer</Text></Pressable>
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
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.orange, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: "#C77500" },
  title: { fontWeight: "900", fontSize: 15, color: T.onSurface },
  sub: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  mBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,26,26,0.6)" },
  mCard: { backgroundColor: T.white, padding: S.lg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg },
  mTitle: { fontWeight: "900", fontSize: 22, color: T.onSurface, marginBottom: S.md },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border, marginTop: 4 },
  label: { fontWeight: "800", color: T.onSurface, fontSize: 13, marginTop: S.md },
  iconBtn: { width: 48, height: 48, borderRadius: R.md, alignItems: "center", justifyContent: "center", backgroundColor: T.surfaceSecondary, borderWidth: 2, borderColor: T.border },
  iconBtnActive: { backgroundColor: "#EFFBE0", borderColor: T.brand },
  cancelBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.surfaceSecondary },
  saveBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.brand, borderBottomWidth: 3, borderBottomColor: T.brandDark },
});
