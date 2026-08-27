import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, storage } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";
import { EmptyState, Card } from "@/src/components/UI";
import ParentPinModal, { hasPinToken } from "@/src/components/ParentPinModal";
import DateField, { toKey, fmtDate } from "@/src/components/DateField";

function displayKey(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return fmtDate(new Date(y, m - 1, d, 12));
}
const todayKey = () => toKey(new Date());

export default function Pauses() {
  const router = useRouter();
  const [members, setMembers] = useState<any[]>([]);
  const [pauses, setPauses] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [pinRequired, setPinRequired] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  const load = useCallback(async () => {
    try {
      const fam = await api.get("/family");
      setMembers((fam.members || []).slice().sort((a: any, b: any) => (a.role === "parent" ? -1 : 1)));
      const p = await api.get("/pauses");
      setPauses(p.pauses || []);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 3000); };
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const requirePin = (action: () => void) => { setPending(() => action); setPinRequired(true); };

  const doSave = async () => {
    setSaving(true);
    try {
      await api.post("/pauses", { user_ids: selected, start_date: toKey(start!), end_date: toKey(end!) });
      showFlash("✅ Pause enregistrée");
      setSelected([]); setStart(null); setEnd(null);
      await load();
    } catch (e: any) {
      if (String(e.message).includes("PIN")) { await storage.del("parent_pin_token"); requirePin(doSave); }
      else showFlash(`❌ ${e.message}`);
    }
    setSaving(false);
  };

  const save = async () => {
    if (selected.length === 0) return showFlash("❌ Sélectionne au moins un membre");
    if (!start || !end) return showFlash("❌ Choisis les dates de début et de fin");
    if (toKey(end) < toKey(start)) return showFlash("❌ La date de fin doit être après le début");
    if (!(await hasPinToken())) return requirePin(doSave);
    await doSave();
  };

  const doRemove = async (id: string) => {
    try { await api.del(`/pauses/${id}`); await load(); showFlash("🗑️ Pause supprimée"); }
    catch (e: any) {
      if (String(e.message).includes("PIN")) { await storage.del("parent_pin_token"); requirePin(() => doRemove(id)); }
      else showFlash(`❌ ${e.message}`);
    }
  };

  const remove = async (id: string) => {
    if (!(await hasPinToken())) return requirePin(() => doRemove(id));
    await doRemove(id);
  };

  const active = pauses.filter(p => p.end_date >= todayKey());
  const past = pauses.filter(p => p.end_date < todayKey());

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Pauses & congés</Text>
          <Text style={s.sub}>Suspendre les tâches et pénalités</Text>
        </View>
      </View>

      {flash ? <View style={s.flash} testID="pauses-flash"><Text style={s.flashText}>{flash}</Text></View> : null}

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}>

        <Card>
          <Text style={s.cardTitle}>Nouvelle pause</Text>
          <Text style={s.help}>{"Pendant la pause, les tâches sont masquées et aucune pénalité n'est appliquée."}</Text>

          <Text style={s.label}>Membres concernés</Text>
          <View style={s.chips}>
            {members.map(m => {
              const on = selected.includes(m.id);
              return (
                <Pressable key={m.id} testID={`pause-member-${m.id}`} onPress={() => toggle(m.id)}
                  style={[s.chip, on && s.chipOn]}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{m.avatar} {m.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.label}>Du</Text>
          <DateField testID="pause-start" value={start} onChange={setStart} minimumDate={new Date(2020, 0, 1)} />
          <Text style={s.label}>Au</Text>
          <DateField testID="pause-end" value={end} onChange={setEnd} minimumDate={start || undefined} />

          <Pressable testID="pause-save" onPress={save} disabled={saving}
            style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }, saving && { opacity: 0.6 }]}>
            {saving ? <ActivityIndicator color={T.white} />
              : <><Ionicons name="pause-circle" size={18} color={T.white} /><Text style={s.ctaText}>Mettre en pause</Text></>}
          </Pressable>
        </Card>

        {active.length > 0 && <Text style={s.section}>Pauses actives / à venir</Text>}
        {active.map(p => (
          <View key={p.id} style={s.row} testID={`pause-${p.id}`}>
            <View style={s.pauseIcon}><Ionicons name="pause" size={18} color={T.orange} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowNames}>{(p.member_names || []).join(", ")}</Text>
              <Text style={s.rowDates}>{displayKey(p.start_date)} → {displayKey(p.end_date)}</Text>
            </View>
            <Pressable testID={`pause-del-${p.id}`} onPress={() => remove(p.id)} style={s.delBtn}>
              <Ionicons name="trash-outline" size={18} color={T.red} />
            </Pressable>
          </View>
        ))}

        {active.length === 0 && past.length === 0 && (
          <EmptyState emoji="🏖️" title="Aucune pause" subtitle="Programmez des vacances ou congés" />
        )}

        {past.length > 0 && <Text style={s.section}>Terminées</Text>}
        {past.map(p => (
          <View key={p.id} style={[s.row, { opacity: 0.6 }]} testID={`pause-${p.id}`}>
            <View style={s.pauseIcon}><Ionicons name="checkmark" size={18} color={T.onSurfaceMuted} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowNames}>{(p.member_names || []).join(", ")}</Text>
              <Text style={s.rowDates}>{displayKey(p.start_date)} → {displayKey(p.end_date)}</Text>
            </View>
            <Pressable testID={`pause-del-${p.id}`} onPress={() => remove(p.id)} style={s.delBtn}>
              <Ionicons name="trash-outline" size={18} color={T.red} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <ParentPinModal visible={pinRequired}
        onCancel={() => { setPinRequired(false); setPending(null); }}
        onSuccess={() => { const fn = pending; setPinRequired(false); setPending(null); fn && fn(); }} />
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
  cardTitle: { fontWeight: "900", fontSize: 16, color: T.onSurface },
  help: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 4 },
  label: { fontWeight: "900", color: T.onSurfaceMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: S.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.sm },
  chip: { paddingHorizontal: S.md, paddingVertical: 8, borderRadius: R.pill, borderWidth: 2, borderColor: T.border, backgroundColor: T.white },
  chipOn: { backgroundColor: T.brand, borderColor: T.brandDark },
  chipText: { fontWeight: "800", color: T.onSurface, fontSize: 13 },
  chipTextOn: { color: T.white },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: S.lg, backgroundColor: T.brand, paddingVertical: 12, borderRadius: R.pill, borderBottomWidth: 4, borderBottomColor: T.brandDark },
  ctaText: { color: T.white, fontWeight: "900", fontSize: 14 },
  section: { fontWeight: "900", color: T.onSurfaceMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: S.md },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, borderColor: T.border },
  pauseIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  rowNames: { fontWeight: "900", color: T.onSurface, fontSize: 15 },
  rowDates: { color: T.onSurfaceMuted, fontSize: 13, marginTop: 2 },
  delBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#FFECEC" },
});
