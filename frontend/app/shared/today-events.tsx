import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function keyFromISO(iso: string) { return dayKey(new Date(iso)); }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }

export default function TodayEvents({ onPress }: { onPress?: () => void }) {
  const [events, setEvents] = useState<any[]>([]);

  const load = useCallback(async () => {
    try { const r = await api.get("/events"); setEvents(r.events || []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const todayEvents = useMemo(() => {
    const k = dayKey(new Date());
    return events.filter((e: any) => keyFromISO(e.start_time) === k).sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
  }, [events]);

  if (todayEvents.length === 0) return null;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm }}>
        <Text style={s.title}>📅 Aujourd&apos;hui</Text>
        {onPress && <Pressable onPress={onPress}><Text style={s.seeAll}>Voir tout</Text></Pressable>}
      </View>
      <View style={{ gap: S.sm }}>
        {todayEvents.map((e: any) => (
          <Pressable key={e.occ_id || e.id} onPress={onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}>
            <View style={[s.stripe, { backgroundColor: e.color || T.brand }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.eTitle}>{e.title}</Text>
              <Text style={s.eSub}>🕒 {fmtTime(e.start_time)}</Text>
            </View>
            {e.recurrence === "weekly" && (
              <View style={s.recurBadge}><Text style={s.recurText}>Hebdo</Text></View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "900", color: T.onSurface, marginBottom: S.sm },
  seeAll: { color: T.brand, fontWeight: "800", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, borderColor: T.border },
  stripe: { width: 6, height: 40, borderRadius: 3 },
  eTitle: { fontWeight: "900", color: T.onSurface, fontSize: 15 },
  eSub: { color: T.onSurfaceMuted, fontSize: 13, marginTop: 2 },
  recurBadge: { backgroundColor: "#EFFBE0", paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill, borderWidth: 1, borderColor: T.brand },
  recurText: { color: T.brandDark, fontWeight: "800", fontSize: 11 },
});
