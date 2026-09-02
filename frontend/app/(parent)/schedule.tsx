import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, TextInput } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";

function pad(n: number) { return String(n).padStart(2, "0"); }

function TimeField({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID?: string }) {
  const [iosOpen, setIosOpen] = useState(false);
  const [webText, setWebText] = useState(value);

  const dateFromValue = () => {
    const [h, m] = value.split(":").map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  };

  if (Platform.OS === "web") {
    return (
      <TextInput
        testID={testID}
        value={webText}
        onChangeText={(t) => { setWebText(t); if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(t)) onChange(t); }}
        placeholder="HH:MM"
        placeholderTextColor={T.onSurfaceMuted}
        style={s.input}
      />
    );
  }

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value: dateFromValue(),
      mode: "time",
      is24Hour: true,
      onChange: (e, d) => {
        if (e.type !== "set" || !d) return;
        onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      },
    });
  };

  return (
    <>
      <Pressable testID={testID} onPress={() => Platform.OS === "android" ? openAndroid() : setIosOpen(true)}
        style={({ pressed }) => [s.field, pressed && { opacity: 0.85 }]}>
        <Ionicons name="time-outline" size={18} color={T.brand} />
        <Text style={s.fieldText}>{value}</Text>
      </Pressable>

      {Platform.OS === "ios" && iosOpen && (
        <View style={s.iosWrap}>
          <DateTimePicker
            value={dateFromValue()}
            mode="time"
            display="spinner"
            is24Hour
            onChange={(e, d) => { if (d) onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`); }}
          />
          <Pressable testID={`${testID}-ios-done`} onPress={() => setIosOpen(false)} style={s.iosDone}>
            <Text style={s.iosDoneText}>OK</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

export default function ScheduleSettings() {
  const router = useRouter();
  const [reminder, setReminder] = useState("19:00");
  const [penalty, setPenalty] = useState("20:00");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const flash = (m: string, isErr = false) => { if (isErr) { setErr(m); setMsg(null); } else { setMsg(m); setErr(null); } setTimeout(() => { setMsg(null); setErr(null); }, 3000); };

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const r = await api.get("/family");
        const fam = r.family || {};
        const rh = fam.reminder_hour ?? 19;
        const rm = fam.reminder_minute ?? 0;
        const ph = fam.penalty_hour ?? 20;
        const pm = fam.penalty_minute ?? 0;
        setReminder(`${pad(rh)}:${pad(rm)}`);
        setPenalty(`${pad(ph)}:${pad(pm)}`);
        setLoaded(true);
      } catch (e: any) {
        flash(e.message, true);
      }
    })();
  }, []));

  const save = async () => {
    const [rh, rm] = reminder.split(":").map(Number);
    const [ph, pm] = penalty.split(":").map(Number);
    try {
      await api.patch("/family", {
        reminder_hour: rh,
        reminder_minute: rm,
        penalty_hour: ph,
        penalty_minute: pm,
      });
      flash("✅ Horaires enregistrés");
    } catch (e: any) {
      flash(e.message, true);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <Text style={s.title}>Horaires</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: S.xxxl }}>
        {msg ? <Text style={s.msg} testID="schedule-msg">{msg}</Text> : null}
        {err ? <Text style={s.err} testID="schedule-error">{err}</Text> : null}

        <View style={s.card}>
          <View style={s.iconRow}>
            <Ionicons name="alarm-outline" size={28} color={T.orange} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Heure des rappels</Text>
              <Text style={s.cardSub}>Les enfants reçoivent un rappel des tâches non terminées</Text>
            </View>
          </View>
          <TimeField value={reminder} onChange={setReminder} testID="reminder-time" />
        </View>

        <View style={s.card}>
          <View style={s.iconRow}>
            <Ionicons name="warning-outline" size={28} color={T.red} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Heure des pénalités</Text>
              <Text style={s.cardSub}>Les tâches non terminées à cette heure entraînent une pénalité</Text>
            </View>
          </View>
          <TimeField value={penalty} onChange={setPenalty} testID="penalty-time" />
        </View>

        <Pressable testID="save-schedule-button" onPress={save} style={({ pressed }) => [s.btn, pressed && { opacity: 0.9 }]}>
          <Text style={s.btnText}>Enregistrer</Text>
        </Pressable>

        <Text style={s.hint}>Par défaut : rappels à 19h00, pénalités à 20h00 (heure du serveur).</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  header: { flexDirection: "row", padding: S.lg, gap: S.sm, alignItems: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: T.white, borderWidth: 2, borderColor: T.border },
  title: { fontSize: 22, fontWeight: "900", color: T.onSurface },
  card: { backgroundColor: T.white, borderRadius: R.lg, padding: S.lg, borderWidth: 2, borderColor: T.border, gap: S.sm },
  iconRow: { flexDirection: "row", alignItems: "flex-start", gap: S.md },
  cardTitle: { fontWeight: "900", fontSize: 15, color: T.onSurface },
  cardSub: { fontSize: 12, color: T.onSurfaceMuted, marginTop: 2 },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border, marginTop: 4 },
  field: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 14, borderWidth: 2, borderColor: T.border, marginTop: 4 },
  fieldText: { fontSize: 16, color: T.onSurface, fontWeight: "800" },
  iosWrap: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, marginTop: S.xs, alignItems: "center" },
  iosDone: { backgroundColor: T.brand, borderRadius: R.pill, paddingVertical: 8, paddingHorizontal: S.xl, marginBottom: S.sm, borderBottomWidth: 3, borderBottomColor: T.brandDark },
  iosDoneText: { color: T.white, fontWeight: "900" },
  btn: { backgroundColor: T.brand, borderRadius: R.pill, paddingVertical: 12, alignItems: "center", borderBottomWidth: 3, borderBottomColor: T.brandDark },
  btnText: { color: T.white, fontWeight: "900", fontSize: 14 },
  msg: { color: T.brand, fontWeight: "800" },
  err: { color: T.red, fontWeight: "800" },
  hint: { color: T.onSurfaceMuted, fontSize: 12, textAlign: "center", marginTop: S.sm },
});
