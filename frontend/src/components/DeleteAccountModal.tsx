import { useEffect, useState } from "react";
import { View, Text, TextInput, Modal, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { T, S, R } from "@/src/lib/theme";
import { deleteAccount } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

export default function DeleteAccountModal({ visible, onCancel }: { visible: boolean; onCancel: () => void }) {
  const { setUser } = useAuth();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) { setPassword(""); setErr(null); } }, [visible]);

  const confirm = async () => {
    if (!password) { setErr("Entrez votre mot de passe"); return; }
    setBusy(true); setErr(null);
    try {
      await deleteAccount(password);
      setUser(null); // navigation gate redirects to login
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.card} testID="delete-account-modal">
          <View style={s.iconWrap}><Ionicons name="warning" size={34} color={T.red} /></View>
          <Text style={s.title}>Supprimer le compte ?</Text>
          <Text style={s.sub}>
            Cette action est définitive. Toutes vos données (points, tâches, preuves) seront effacées.
            Confirmez avec votre mot de passe.
          </Text>
          <TextInput
            testID="delete-account-password-input"
            value={password} onChangeText={setPassword}
            placeholder="Mot de passe" placeholderTextColor={T.onSurfaceMuted}
            secureTextEntry autoFocus style={s.input}
          />
          {err ? <Text style={s.err} testID="delete-account-error">{err}</Text> : null}
          <Pressable testID="confirm-delete-account-button" onPress={confirm} disabled={busy}
            style={({ pressed }) => [s.dangerBtn, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color={T.white} /> : <Text style={s.dangerText}>Supprimer définitivement</Text>}
          </Pressable>
          <Pressable testID="cancel-delete-account-button" onPress={onCancel} disabled={busy} style={s.cancelBtn}>
            <Text style={s.cancelText}>Annuler</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(26,26,26,0.6)", alignItems: "center", justifyContent: "center", padding: S.lg },
  card: { backgroundColor: T.white, borderRadius: R.lg, padding: S.xl, width: "100%", maxWidth: 360, borderWidth: 2, borderColor: T.border, alignItems: "center" },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#FFECEC", alignItems: "center", justifyContent: "center", marginBottom: S.sm },
  title: { fontSize: 20, fontWeight: "900", color: T.onSurface },
  sub: { color: T.onSurfaceMuted, textAlign: "center", marginTop: S.sm, marginBottom: S.md, fontSize: 13, lineHeight: 19 },
  input: { width: "100%", backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 14, fontSize: 16, color: T.onSurface, borderWidth: 2, borderColor: T.border },
  err: { color: T.red, fontWeight: "700", marginTop: S.sm, alignSelf: "flex-start" },
  dangerBtn: { width: "100%", backgroundColor: T.red, borderRadius: R.pill, paddingVertical: 15, alignItems: "center", marginTop: S.md, borderBottomWidth: 4, borderBottomColor: "#C93333" },
  dangerText: { color: T.white, fontWeight: "900", fontSize: 15 },
  cancelBtn: { padding: S.md, marginTop: S.xs },
  cancelText: { color: T.onSurfaceMuted, fontWeight: "800" },
});
