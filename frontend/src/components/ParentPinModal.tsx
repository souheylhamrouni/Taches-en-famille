import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Modal, Pressable, StyleSheet } from "react-native";
import { T, S, R } from "@/src/lib/theme";
import { storage, verifyPin } from "@/src/lib/api";

type Props = {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
};

export default function ParentPinModal({ visible, onSuccess, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) { setPin(""); setErr(null); } }, [visible]);

  const submit = async (val: string) => {
    if (val.length !== 4) return;
    setBusy(true); setErr(null);
    try { await verifyPin(val); onSuccess(); }
    catch (e: any) { setErr(e.message); setPin(""); }
    setBusy(false);
  };

  const onChange = (t: string) => {
    const v = t.replace(/\D/g, "").slice(0, 4);
    setPin(v);
    if (v.length === 4) submit(v);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.card} testID="parent-pin-modal">
          <Text style={{ fontSize: 44, marginBottom: S.sm }}>🔐</Text>
          <Text style={s.title}>PIN parent</Text>
          <Text style={s.sub}>Entrez votre code à 4 chiffres</Text>
          <TextInput
            testID="parent-pin-input"
            value={pin} onChangeText={onChange}
            keyboardType="number-pad" secureTextEntry maxLength={4}
            autoFocus style={s.input} placeholder="••••" placeholderTextColor={T.onSurfaceMuted}
          />
          <View style={s.dotsRow}>
            {[0,1,2,3].map(i => (
              <View key={i} style={[s.dot, pin.length > i && s.dotFilled]} />
            ))}
          </View>
          {err ? <Text style={s.err} testID="parent-pin-error">{err}</Text> : null}
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

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(26,26,26,0.6)", alignItems: "center", justifyContent: "center", padding: S.lg },
  card: { backgroundColor: T.white, borderRadius: R.lg, padding: S.xl, alignItems: "center", width: "100%", maxWidth: 340, borderWidth: 2, borderColor: T.border },
  title: { fontSize: 22, fontWeight: "900", color: T.onSurface },
  sub: { color: T.onSurfaceMuted, marginBottom: S.md, marginTop: S.xs },
  input: { position: "absolute", opacity: 0, height: 1, width: 1 },
  dotsRow: { flexDirection: "row", gap: S.md, marginVertical: S.md },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: T.border, backgroundColor: T.surfaceSecondary },
  dotFilled: { backgroundColor: T.brand, borderColor: T.brandDark },
  err: { color: T.red, fontWeight: "700", marginTop: S.sm },
  cancelBtn: { marginTop: S.md, padding: S.sm },
  cancelText: { color: T.onSurfaceMuted, fontWeight: "700" },
});
