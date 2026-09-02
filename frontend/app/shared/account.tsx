import { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, changePin } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";

export default function Account() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const isParent = user?.role === "parent";
  const [name, setName] = useState(user?.name || "");
  const [famName, setFamName] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [curPin, setCurPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const flash = (m: string, isErr = false) => { if (isErr) { setErr(m); setMsg(null); } else { setMsg(m); setErr(null); } setTimeout(() => { setMsg(null); setErr(null); }, 3000); };

  const saveName = async () => {
    try { await api.patch("/auth/profile", { name: name.trim() }); await refresh(); flash("✅ Nom mis à jour"); }
    catch (e: any) { flash(e.message, true); }
  };
  const saveFamily = async () => {
    try { await api.patch("/family", { name: famName.trim() }); flash("✅ Nom de tribu mis à jour"); }
    catch (e: any) { flash(e.message, true); }
  };
  const savePassword = async () => {
    try { await api.patch("/auth/password", { current_password: curPw, new_password: newPw }); setCurPw(""); setNewPw(""); flash("✅ Mot de passe changé"); }
    catch (e: any) { flash(e.message, true); }
  };
  const savePin = async () => {
    try { await changePin(curPin, newPin); setCurPin(""); setNewPin(""); flash("✅ Code PIN modifié"); }
    catch (e: any) { flash(e.message, true); }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <Text style={s.title}>Mon compte</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: S.xxxl }} keyboardShouldPersistTaps="handled">
          {msg ? <Text style={s.msg} testID="account-msg">{msg}</Text> : null}
          {err ? <Text style={s.err} testID="account-error">{err}</Text> : null}

          <View style={s.card}>
            <Text style={s.cardTitle}>Mon prénom</Text>
            <TextInput testID="account-name-input" value={name} onChangeText={setName} style={s.input} placeholderTextColor={T.onSurfaceMuted} />
            <Pressable testID="save-name-button" onPress={saveName} style={s.btn}><Text style={s.btnText}>Enregistrer</Text></Pressable>
          </View>

          {isParent && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Nom de la tribu</Text>
              <TextInput testID="account-family-input" value={famName} onChangeText={setFamName} placeholder="Nouveau nom de tribu" placeholderTextColor={T.onSurfaceMuted} style={s.input} />
              <Pressable testID="save-family-button" onPress={saveFamily} style={s.btn}><Text style={s.btnText}>Enregistrer</Text></Pressable>
            </View>
          )}

          <View style={s.card}>
            <Text style={s.cardTitle}>Changer le mot de passe</Text>
            <TextInput testID="account-curpw-input" value={curPw} onChangeText={setCurPw} placeholder="Mot de passe actuel" placeholderTextColor={T.onSurfaceMuted} secureTextEntry style={s.input} />
            <TextInput testID="account-newpw-input" value={newPw} onChangeText={setNewPw} placeholder="Nouveau mot de passe" placeholderTextColor={T.onSurfaceMuted} secureTextEntry style={s.input} />
            <Pressable testID="save-password-button" onPress={savePassword} style={s.btn}><Text style={s.btnText}>Changer</Text></Pressable>
          </View>

          {isParent && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Changer le code PIN</Text>
              <TextInput testID="account-curpin-input" value={curPin} onChangeText={setCurPin} placeholder="PIN actuel (4 ou 6 chiffres)" placeholderTextColor={T.onSurfaceMuted} secureTextEntry keyboardType="number-pad" maxLength={6} style={s.input} />
              <TextInput testID="account-newpin-input" value={newPin} onChangeText={setNewPin} placeholder="Nouveau PIN (6 chiffres)" placeholderTextColor={T.onSurfaceMuted} secureTextEntry keyboardType="number-pad" maxLength={6} style={s.input} />
              <Pressable testID="save-pin-button" onPress={savePin} style={s.btn}><Text style={s.btnText}>Changer le PIN</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  header: { flexDirection: "row", padding: S.lg, gap: S.sm, alignItems: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: T.white, borderWidth: 2, borderColor: T.border },
  title: { fontSize: 22, fontWeight: "900", color: T.onSurface },
  card: { backgroundColor: T.white, borderRadius: R.lg, padding: S.lg, borderWidth: 2, borderColor: T.border, gap: S.sm },
  cardTitle: { fontWeight: "900", fontSize: 15, color: T.onSurface },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border, marginTop: 4 },
  btn: { backgroundColor: T.brand, borderRadius: R.pill, paddingVertical: 12, alignItems: "center", marginTop: S.sm, borderBottomWidth: 3, borderBottomColor: T.brandDark },
  btnText: { color: T.white, fontWeight: "900", fontSize: 14 },
  msg: { color: T.brand, fontWeight: "800" },
  err: { color: T.red, fontWeight: "800" },
});
