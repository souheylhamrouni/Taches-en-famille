import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
 
export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
 
  const onSubmit = async () => {
    setErr(null); setBusy(true);
    try { await login(email.trim(), password); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
 
  const fillDemo = (who: string) => {
    setEmail(who);
    setPassword("demo1234");
  };
 
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.emoji}>🦸‍♂️</Text>
            <Text style={styles.title} testID="app-title">TribuQuest</Text>
            <Text style={styles.subtitle}>Transforme tes corvées en aventures !</Text>
          </View>
 
          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
              value={email} onChangeText={setEmail}
              placeholder="ton.email@exemple.fr"
              placeholderTextColor={T.onSurfaceMuted}
              autoCapitalize="none" keyboardType="email-address"
              style={styles.input}
            />
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              testID="login-password-input"
              value={password} onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={T.onSurfaceMuted}
              secureTextEntry style={styles.input}
            />
            {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}
            <Pressable
              testID="login-submit-button"
              onPress={onSubmit} disabled={busy}
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}
            >
              <Text style={styles.btnText}>{busy ? "Connexion..." : "Se connecter"}</Text>
            </Pressable>
 
            <Link href="/(auth)/register" asChild>
              <Pressable testID="go-register-button" style={styles.linkBtn}>
                <Text style={styles.linkText}>Créer un compte</Text>
              </Pressable>
            </Link>
            <Link href="/(auth)/forgot" asChild>
              <Pressable testID="go-forgot-button" style={styles.linkBtn}>
                <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
              </Pressable>
            </Link>
          </View>
 
          <View style={styles.demoCard}>
            <Text style={styles.demoTitle}>🎮 Comptes de démo</Text>
            <View style={{ gap: S.sm }}>
              <Pressable testID="demo-parent-button" onPress={() => fillDemo("papa@demo.fr")} style={styles.demoRow}>
                <Ionicons name="shield-checkmark" size={20} color={T.orange} />
                <Text style={styles.demoText}>Papa (adulte) · PIN 123456</Text>
              </Pressable>
              <Pressable testID="demo-kid-lea-button" onPress={() => fillDemo("lea@demo.fr")} style={styles.demoRow}>
                <Text style={{ fontSize: 20 }}>🐻</Text>
                <Text style={styles.demoText}>Léa (enfant)</Text>
              </Pressable>
              <Pressable testID="demo-kid-hugo-button" onPress={() => fillDemo("hugo@demo.fr")} style={styles.demoRow}>
                <Text style={{ fontSize: 20 }}>🦊</Text>
                <Text style={styles.demoText}>Hugo (enfant)</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
 
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  scroll: { padding: S.lg, gap: S.lg },
  hero: { alignItems: "center", paddingTop: S.xl, gap: S.sm },
  emoji: { fontSize: 72 },
  title: { fontSize: 34, fontWeight: "900", color: T.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: T.onSurfaceMuted, textAlign: "center" },
  card: {
    backgroundColor: T.white, padding: S.lg, borderRadius: R.lg,
    borderWidth: 2, borderColor: T.border, gap: S.sm,
  },
  label: { color: T.onSurface, fontWeight: "700", marginTop: S.sm, fontSize: 13 },
  input: {
    backgroundColor: T.surfaceSecondary, borderRadius: R.md,
    paddingHorizontal: S.md, paddingVertical: 14, fontSize: 16,
    color: T.onSurface, borderWidth: 2, borderColor: T.border,
  },
  err: { color: T.red, fontWeight: "700", marginTop: S.xs },
  btn: {
    backgroundColor: T.brand, borderRadius: R.pill,
    paddingVertical: 16, alignItems: "center", marginTop: S.md,
    borderBottomWidth: 4, borderBottomColor: T.brandDark,
  },
  btnText: { color: T.white, fontSize: 17, fontWeight: "900", letterSpacing: 0.3 },
  linkBtn: { alignItems: "center", padding: S.md },
  linkText: { color: T.brand, fontWeight: "800", fontSize: 15 },
  forgotText: { color: T.onSurfaceMuted, fontWeight: "700", fontSize: 14 },
  demoCard: {
    backgroundColor: T.surfaceSecondary, borderRadius: R.lg, padding: S.lg,
    borderWidth: 2, borderColor: T.border, gap: S.md,
  },
  demoTitle: { fontWeight: "900", fontSize: 15, color: T.onSurface },
  demoRow: { flexDirection: "row", alignItems: "center", gap: S.sm, padding: S.sm, backgroundColor: T.white, borderRadius: R.md },
  demoText: { color: T.onSurface, fontWeight: "700", fontSize: 14 },
});
