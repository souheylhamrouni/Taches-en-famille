import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { EmptyState } from "@/src/components/UI";
import DateTimeField from "@/src/components/DateTimeField";

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const COLORS = ["#58CC02", "#FF9600", "#FFC800", "#FF4B4B", "#1CB0F6", "#CE82FF"];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function keyFromISO(iso: string) { return dayKey(new Date(iso)); }
function fmtLong(iso: string) { return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }

export default function Calendar() {
  const router = useRouter();
  const { user } = useAuth();
  const isParent = user?.role === "parent";
  const [events, setEvents] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [selected, setSelected] = useState<string | null>(null);

  // modal state (create + edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [hasRange, setHasRange] = useState(false);
  const [color, setColor] = useState("#58CC02");
  const [weekly, setWeekly] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get("/events"); setEvents(r.events || []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of events) { const k = keyFromISO(e.start_time); (map[k] ||= []).push(e); }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(cursor.y, cursor.m, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  const todayKey = dayKey(new Date());
  const shiftMonth = (dir: number) => {
    setSelected(null);
    setCursor(c => { const m = c.m + dir; if (m < 0) return { y: c.y - 1, m: 11 }; if (m > 11) return { y: c.y + 1, m: 0 }; return { y: c.y, m }; });
  };

  const listEvents = useMemo(() => {
    if (selected) return (byDay[selected] || []).sort((a, b) => a.start_time.localeCompare(b.start_time));
    return events.filter(e => { const d = new Date(e.start_time); return d.getFullYear() === cursor.y && d.getMonth() === cursor.m; })
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [selected, byDay, events, cursor]);

  const openCreate = () => {
    setEditingId(null); setTitle("");
    const base = selected ? new Date(selected + "T09:00:00") : new Date();
    setStartDate(base); setEndDate(null); setHasRange(false);
    setColor("#58CC02"); setWeekly(false); setErr(null); setModalOpen(true);
  };

  const openEdit = (e: any) => {
    setEditingId(e.id); setTitle(e.title);
    setStartDate(new Date(e.start_time));
    setEndDate(e.end_time ? new Date(e.end_time) : null);
    setHasRange(!!e.end_time);
    setColor(e.color || "#58CC02");
    setWeekly(e.recurrence === "weekly");
    setErr(null); setModalOpen(true);
  };

  const save = async () => {
    setErr(null);
    if (!title.trim()) { setErr("Titre requis"); return; }
    if (!startDate) { setErr("Date de début requise"); return; }
    if (hasRange && endDate && endDate < startDate) { setErr("La fin doit être après le début"); return; }
    const payload: any = {
      title: title.trim(),
      start_time: startDate.toISOString(),
      end_time: hasRange && endDate ? endDate.toISOString() : null,
      color,
      recurrence: weekly ? "weekly" : "none",
    };
    try {
      if (editingId) await api.patch(`/events/${editingId}`, payload);
      else await api.post("/events", payload);
      setModalOpen(false); await load();
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
        <Pressable testID="open-add-event" onPress={openCreate} style={s.addBtn}>
          <Ionicons name="add" size={22} color={T.white} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}>

        <View style={s.calCard} testID="calendar-grid">
          <View style={s.monthNav}>
            <Pressable testID="prev-month" onPress={() => shiftMonth(-1)} style={s.navBtn}>
              <Ionicons name="chevron-back" size={20} color={T.onSurface} />
            </Pressable>
            <Text style={s.monthLabel} testID="month-label">{MONTHS[cursor.m]} {cursor.y}</Text>
            <Pressable testID="next-month" onPress={() => shiftMonth(1)} style={s.navBtn}>
              <Ionicons name="chevron-forward" size={20} color={T.onSurface} />
            </Pressable>
          </View>
          <View style={s.weekRow}>{WEEKDAYS.map((w, i) => <Text key={i} style={s.weekday}>{w}</Text>)}</View>
          <View style={s.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={s.cell} />;
              const k = dayKey(d);
              const evs = byDay[k] || [];
              const isToday = k === todayKey;
              const isSel = k === selected;
              return (
                <Pressable key={i} testID={`day-${k}`} onPress={() => setSelected(isSel ? null : k)}
                  style={[s.cell, isSel && s.cellSel, isToday && !isSel && s.cellToday]}>
                  <Text style={[s.cellNum, isSel && s.cellNumSel, isToday && !isSel && s.cellNumToday]}>{d.getDate()}</Text>
                  <View style={s.dots}>
                    {evs.slice(0, 3).map((e, j) => (
                      <View key={j} style={[s.dot, { backgroundColor: isSel ? T.white : (e.color || T.brand) }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={s.agendaTitle}>
            {selected ? new Date(selected).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "Ce mois-ci"}
          </Text>
          {selected && <Pressable testID="clear-day-filter" onPress={() => setSelected(null)}><Text style={s.clearFilter}>Tout voir</Text></Pressable>}
        </View>

        {listEvents.length === 0
          ? <EmptyState emoji="📅" title={selected ? "Aucun événement ce jour" : "Aucun événement ce mois-ci"} subtitle="Ajoute-en un avec le +" />
          : listEvents.map(e => (
            <View key={e.occ_id || e.id} style={s.eventRow} testID={`event-${e.occ_id || e.id}`}>
              <View style={[s.stripe, { backgroundColor: e.color || T.brand }]} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text style={s.eTitle}>{e.title}</Text>
                  {e.recurrence === "weekly" && (
                    <View style={s.recurBadge}><Ionicons name="repeat" size={11} color={T.brandDark} /><Text style={s.recurText}>Hebdo</Text></View>
                  )}
                </View>
                <Text style={s.eSub}>
                  📅 {fmtLong(e.start_time)} · {fmtTime(e.start_time)}
                  {e.end_time ? `  →  ${fmtLong(e.end_time)} · ${fmtTime(e.end_time)}` : ""}
                </Text>
              </View>
              {isParent && (
                <Pressable testID={`edit-event-${e.occ_id || e.id}`} onPress={() => openEdit(e)} style={{ padding: 4 }}>
                  <Ionicons name="create-outline" size={20} color={T.brand} />
                </Pressable>
              )}
              <Pressable testID={`del-event-${e.occ_id || e.id}`} onPress={async () => { await api.del(`/events/${e.id}`); await load(); }} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={20} color={T.onSurfaceMuted} />
              </Pressable>
            </View>
          ))}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={s.mBackdrop}>
          <View style={s.mCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.mTitle}>{editingId ? "Modifier l'événement" : "Nouvel événement"}</Text>
              <TextInput testID="event-title-input" value={title} onChangeText={setTitle}
                placeholder="Titre" placeholderTextColor={T.onSurfaceMuted} style={s.input} />

              <Text style={s.label}>Début</Text>
              <DateTimeField testID="event-start-field" value={startDate} onChange={setStartDate} />

              <Pressable testID="range-toggle" onPress={() => setHasRange(r => !r)} style={s.recurRow}>
                <View style={s.recurLeft}><Ionicons name="time-outline" size={20} color={T.brand} /><Text style={s.recurLabel}>Définir une fin (du… au…)</Text></View>
                <View style={[s.toggle, hasRange && s.toggleOn]}><View style={[s.knob, hasRange && s.knobOn]} /></View>
              </Pressable>
              {hasRange && (
                <>
                  <Text style={s.label}>Fin</Text>
                  <DateTimeField testID="event-end-field" value={endDate} onChange={setEndDate} minimumDate={startDate || undefined} />
                </>
              )}

              <Text style={s.label}>Couleur</Text>
              <View style={{ flexDirection: "row", gap: S.sm }}>
                {COLORS.map(c => (
                  <Pressable key={c} testID={`color-${c}`} onPress={() => setColor(c)} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotActive]} />
                ))}
              </View>

              <Pressable testID="recurrence-toggle" onPress={() => setWeekly(w => !w)} style={s.recurRow}>
                <View style={s.recurLeft}><Ionicons name="repeat" size={20} color={T.brand} /><Text style={s.recurLabel}>Répéter chaque semaine</Text></View>
                <View style={[s.toggle, weekly && s.toggleOn]}><View style={[s.knob, weekly && s.knobOn]} /></View>
              </Pressable>

              {err ? <Text style={{ color: T.red, fontWeight: "700", marginTop: S.sm }}>{err}</Text> : null}
              <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
                <Pressable style={s.cancelBtn} onPress={() => setModalOpen(false)}><Text style={{ fontWeight: "800", color: T.onSurfaceMuted }}>Annuler</Text></Pressable>
                <Pressable testID="save-event-button" style={s.saveBtn} onPress={save}><Text style={{ fontWeight: "900", color: T.white }}>{editingId ? "Enregistrer" : "Créer"}</Text></Pressable>
              </View>
            </ScrollView>
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
  calCard: { backgroundColor: T.white, borderRadius: R.lg, padding: S.md, borderWidth: 2, borderColor: T.border },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: T.surfaceSecondary },
  monthLabel: { fontWeight: "900", fontSize: 17, color: T.onSurface },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", fontWeight: "800", color: T.onSurfaceMuted, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: R.sm, gap: 2 },
  cellToday: { backgroundColor: "#EFFBE0" },
  cellSel: { backgroundColor: T.brand },
  cellNum: { fontWeight: "700", color: T.onSurface, fontSize: 14 },
  cellNumToday: { color: T.brandDark, fontWeight: "900" },
  cellNumSel: { color: T.white, fontWeight: "900" },
  dots: { flexDirection: "row", gap: 2, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  agendaTitle: { fontWeight: "900", fontSize: 16, color: T.onSurface, textTransform: "capitalize" },
  clearFilter: { color: T.brand, fontWeight: "800", fontSize: 13 },
  eventRow: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, borderColor: T.border },
  stripe: { width: 6, height: 40, borderRadius: 3 },
  eTitle: { fontWeight: "900", color: T.onSurface, fontSize: 15 },
  eSub: { color: T.onSurfaceMuted, fontSize: 13, marginTop: 2, textTransform: "capitalize" },
  recurBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#EFFBE0", paddingHorizontal: 6, paddingVertical: 2, borderRadius: R.pill },
  recurText: { color: T.brandDark, fontWeight: "800", fontSize: 10 },
  mBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,26,26,0.6)" },
  mCard: { backgroundColor: T.white, padding: S.lg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, maxHeight: "88%" },
  mTitle: { fontWeight: "900", fontSize: 20, color: T.onSurface, marginBottom: S.sm },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border },
  label: { fontWeight: "800", color: T.onSurface, fontSize: 13, marginTop: S.md },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: "transparent", marginTop: 4 },
  colorDotActive: { borderColor: T.onSurface },
  recurRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: T.surfaceSecondary, padding: S.md, borderRadius: R.md, marginTop: S.md, borderWidth: 2, borderColor: T.border },
  recurLeft: { flexDirection: "row", alignItems: "center", gap: S.sm, flex: 1 },
  recurLabel: { fontWeight: "800", color: T.onSurface, fontSize: 14 },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: T.borderStrong, padding: 3, justifyContent: "center" },
  toggleOn: { backgroundColor: T.brand },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: T.white },
  knobOn: { alignSelf: "flex-end" },
  cancelBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.surfaceSecondary },
  saveBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.brand, borderBottomWidth: 3, borderBottomColor: T.brandDark },
});
