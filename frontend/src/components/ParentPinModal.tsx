import { useEffect, useState } from "react";
import { View, Text, Modal, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { T, S, R } from "@/src/lib/theme";
import { storage, verifyPin } from "@/src/lib/api";

type Props = {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export default function ParentPinModal({ visible, onSuccess, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) { setPin(""); setErr(null); setBusy(false); } }, [visible]);

  const submit = async (val: string) => {
    setBusy(true); setErr(null);
    try { await verifyPin(val); onSuccess(); }
    catch (e: any) { setErr(e.message); setPin(""); setBusy(false); }
  };

  const press = (k: string) => {
    if (busy) return;
    if (k === "del") { setErr(null); setPin(p => p.slice(0, -1)); return; }
    if (k === "") return;
    setErr(null);
    setPin(p => {
      if (p.length >= 4) return p;
      const next = p + k;
      if (next.length === 4) submit(next);
      return next;
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.card} testID="parent-pin-modal">
          <Text style={{ fontSize: 44, marginBottom: S.sm }}>🔐</Text>
          <Text style={s.title}>PIN parent</Text>
          <Text style={s.sub}>Entrez votre code à 4 chiffres</Text>

          <View style={s.dotsRow}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[s.dot, pin.length > i && s.dotFilled]} />
            ))}
          </View>

          {err ? <Text style={s.err} testID="parent-pin-error">{err}</Text> : null}

          {busy ? (
            <View style={s.busy}><ActivityIndicator color={T.brand} /></View>
          ) : (
            <View style={s.pad}>
              {KEYS.map((k, idx) => {
                if (k === "") return <View key={idx} style={s.key} />;
                if (k === "del") return (
                  <Pressable key={idx} testID="pin-key-del" onPress={() => press(k)}
                    style={({ pressed }) => [s.key, pressed && s.keyPressed]}>
                    <Ionicons name="backspace-outline" size={26} color={T.onSurface} />
                  </Pressable>
                );
                return (
                  <Pressable key={idx} testID={`pin-key-${k}`} onPress={() => press(k)}
                    style={({ pressed }) => [s.key, s.keyNum, pressed && s.keyPressed]}>
                    <Text style={s.keyText}>{k}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable testID="parent-pin-cancel-button" onPress={onCancel} style={s.cancelBtn} disabled={busy}>
            <Text style={s.cancelText}>Annuler</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export async function hasPinToken() {
  return !!(await storage.get("parent_pin_token"));
}

const KEY_SIZE = 68;

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(26,26,26,0.6)", alignItems: "center", justifyContent: "center", padding: S.lg },
  card: { backgroundColor: T.white, borderRadius: R.lg, padding: S.xl, alignItems: "center", width: "100%", maxWidth: 340, borderWidth: 2, borderColor: T.border },
  title: { fontSize: 22, fontWeight: "900", color: T.onSurface },
  sub: { color: T.onSurfaceMuted, marginBottom: S.md, marginTop: S.xs },
  dotsRow: { flexDirection: "row", gap: S.md, marginVertical: S.md },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: T.border, backgroundColor: T.surfaceSecondary },
  dotFilled: { backgroundColor: T.brand, borderColor: T.brandDark },
  err: { color: T.red, fontWeight: "700", marginBottom: S.sm },
  busy: { height: KEY_SIZE * 4 + S.sm * 3, alignItems: "center", justifyContent: "center" },
  pad: { flexDirection: "row", flexWrap: "wrap", width: KEY_SIZE * 3 + S.sm * 2, gap: S.sm, justifyContent: "space-between" },
  key: { width: KEY_SIZE, height: KEY_SIZE, alignItems: "center", justifyContent: "center", borderRadius: KEY_SIZE / 2 },
  keyNum: { backgroundColor: T.surfaceSecondary, borderWidth: 2, borderColor: T.border },
  keyPressed: { backgroundColor: "#EFFBE0", borderColor: T.brand },
  keyText: { fontSize: 28, fontWeight: "800", color: T.onSurface },
  cancelBtn: { marginTop: S.lg, padding: S.sm },
  cancelText: { color: T.onSurfaceMuted, fontWeight: "700" },
});
