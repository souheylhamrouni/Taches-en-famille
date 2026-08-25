import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";

export default function Forgot() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setErr(null); setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setMsg("Si un compte existe, un code a été envoyé par email.");
      setStep(2);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const reset = async () => {
    setErr(null); setBusy(true);
    try {
      await api.post("/auth/reset-password", { email: email.trim(), code: code.trim(), new_password: pw });
      setMsg("✅ Mot de passe modifié ! Connectez-vous.");
      setTimeout(() => router.replace("/(auth)/login"), 1200);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Mot de passe oublié</Text>
          <View style={s.card}>
            <Text style={s.label}>Email</Text>
            <TextInput testID="forgot-email-input" value={email} onChangeText={setEmail} editable={step === 1}
              placeholder="ton.email@exemple.fr" placeholderTextColor={T.onSurfaceMuted}
              autoCapitalize="none" keyboardType="email-address" style={s.input} />
            {step === 2 && (
              <>
                <Text style={s.label}>Code reçu par email (6 chiffres)</Text>
                <TextInput testID="forgot-code-input" value={code} onChangeText={setCode}
                  placeholder="123456" placeholderTextColor={T.onSurfaceMuted} keyboardType="number-pad" maxLength={6} style={s.input} />
                <Text style={s.label}>Nouveau mot de passe</Text>
                <TextInput testID="forgot-newpw-input" value={pw} onChangeText={setPw}
                  placeholder="6 caractères min." placeholderTextColor={T.onSurfaceMuted} secureTextEntry style={s.input} />
              </>
            )}
            {msg ? <Text style={s.msg} testID="forgot-msg">{msg}</Text> : null}
            {err ? <Text style={s.err} testID="forgot-error">{err}</Text> : null}
            <Pressable testID="forgot-submit" onPress={step === 1 ? sendCode : reset} disabled={busy}
              style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}>
              <Text style={s.btnText}>{busy ? "..." : step === 1 ? "Envoyer le code" : "Réinitialiser"}</Text>
            </Pressable>
            <Pressable testID="forgot-back" onPress={() => router.replace("/(auth)/login")} style={s.linkBtn}>
              <Text style={s.linkText}>Retour à la connexion</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  scroll: { padding: S.lg, gap: S.lg },
  title: { fontSize: 28, fontWeight: "900", color: T.onSurface, marginTop: S.sm },
  card: { backgroundColor: T.white, padding: S.lg, borderRadius: R.lg, borderWidth: 2, borderColor: T.border, gap: S.sm },
  label: { color: T.onSurface, fontWeight: "700", marginTop: S.sm, fontSize: 13 },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 14, fontSize: 16, color: T.onSurface, borderWidth: 2, borderColor: T.border },
  msg: { color: T.brand, fontWeight: "700", marginTop: S.sm },
  err: { color: T.red, fontWeight: "700", marginTop: S.xs },
  btn: { backgroundColor: T.brand, borderRadius: R.pill, paddingVertical: 16, alignItems: "center", marginTop: S.md, borderBottomWidth: 4, borderBottomColor: T.brandDark },
  btnText: { color: T.white, fontSize: 17, fontWeight: "900" },
  linkBtn: { alignItems: "center", padding: S.md },
  linkText: { color: T.brand, fontWeight: "800", fontSize: 15 },
});
