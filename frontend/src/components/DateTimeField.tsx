import { useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { T, S, R } from "@/src/lib/theme";

function pad(n: number) { return String(n).padStart(2, "0"); }
export function fmtInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtDisplay(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function parseInput(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

type Props = {
  value: Date | null;
  onChange: (d: Date) => void;
  testID?: string;
  placeholder?: string;
  minimumDate?: Date;
};

export default function DateTimeField({ value, onChange, testID, placeholder = "Choisir date et heure", minimumDate }: Props) {
  const [iosOpen, setIosOpen] = useState(false);
  const [webText, setWebText] = useState(value ? fmtInput(value) : "");

  // WEB fallback: plain text input (native picker not supported on react-native-web).
  if (Platform.OS === "web") {
    return (
      <TextInput
        testID={testID}
        value={webText}
        onChangeText={(t) => { setWebText(t); const d = parseInput(t); if (d) onChange(d); }}
        placeholder="AAAA-MM-JJ HH:MM"
        placeholderTextColor={T.onSurfaceMuted}
        autoCapitalize="none"
        style={s.input}
      />
    );
  }

  const openAndroid = () => {
    const base = value || new Date();
    DateTimePickerAndroid.open({
      value: base, mode: "date", is24Hour: true, minimumDate,
      onChange: (e, d) => {
        if (e.type !== "set" || !d) return;
        const day = d;
        DateTimePickerAndroid.open({
          value: base, mode: "time", is24Hour: true,
          onChange: (e2, t) => {
            if (e2.type !== "set" || !t) return;
            const r = new Date(day);
            r.setHours(t.getHours(), t.getMinutes(), 0, 0);
            onChange(r);
          },
        });
      },
    });
  };

  return (
    <>
      <Pressable testID={testID} onPress={() => Platform.OS === "android" ? openAndroid() : setIosOpen(true)}
        style={({ pressed }) => [s.field, pressed && { opacity: 0.85 }]}>
        <Ionicons name="calendar-outline" size={18} color={T.brand} />
        <Text style={[s.fieldText, !value && { color: T.onSurfaceMuted }]}>
          {value ? fmtDisplay(value) : placeholder}
        </Text>
      </Pressable>

      {Platform.OS === "ios" && iosOpen && (
        <View style={s.iosWrap}>
          <DateTimePicker
            value={value || new Date()}
            mode="datetime"
            display="spinner"
            minimumDate={minimumDate}
            onChange={(e, d) => { if (d) onChange(d); }}
          />
          <Pressable testID={`${testID}-ios-done`} onPress={() => setIosOpen(false)} style={s.iosDone}>
            <Text style={s.iosDoneText}>OK</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border, marginTop: 4 },
  field: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 14, borderWidth: 2, borderColor: T.border, marginTop: 4 },
  fieldText: { fontSize: 15, color: T.onSurface, fontWeight: "700" },
  iosWrap: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, marginTop: S.xs, alignItems: "center" },
  iosDone: { backgroundColor: T.brand, borderRadius: R.pill, paddingVertical: 8, paddingHorizontal: S.xl, marginBottom: S.sm, borderBottomWidth: 3, borderBottomColor: T.brandDark },
  iosDoneText: { color: T.white, fontWeight: "900" },
});
