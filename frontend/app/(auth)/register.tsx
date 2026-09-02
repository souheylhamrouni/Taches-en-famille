import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { useAuth } from "@/src/lib/auth";
import { api } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";
 
const AVATARS_PARENT = ["🦸", "👩", "🧑", "🦸‍♀️"];
const AVATARS_CHILD = ["🐻", "🦊", "🐼", "🐯", "🐸", "🦄"];
 
export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [role, setRole] = useState<"parent" | "child">("parent");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [parentMode, setParentMode] = useState<"new" | "join">("new");
  const [pin, setPin] = useState("");
  const [avatar, setAvatar] = useState<string>("🦸");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);

  const avatars = role === "parent" ? AVATARS_PARENT : AVATARS_CHILD;

  const onSubmit = async () => {
    setErr(null); setBusy(true); setVerifyUrl(null);
    try {
      const payload: any = { email: email.trim(), password, name: name.trim(), role, avatar };
      if (role === "parent") {
        if (!/^\d{6}$/.test(pin)) throw new Error("PIN à 6 chiffres requis");
        payload.pin = pin;
        if (parentMode === "new") {
          payload.family_name = familyName || `Tribu ${name}`;
        } else {
          if (!familyId.trim()) throw new Error("Code tribu requis pour rejoindre une tribu");
          payload.family_id = familyId.trim();
        }
      } else {
        if (!familyId) throw new Error("Code tribu requis pour un enfant");
        payload.family_id = familyId.trim();
      }
      const result: any = await register(payload);
      if (result?.verify_url) setVerifyUrl(result.verify_url);
      if (result?.email_verified === false) {
        // Account created but not verified — show the verify banner
      }
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
 
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Créer un compte</Text>
 
          <View style={styles.roleRow}>
            <Pressable
              testID="role-parent-button"
              onPress={() => { setRole("parent"); setAvatar(AVATARS_PARENT[0]); }}
              style={[styles.roleChip, role === "parent" && styles.roleChipActive]}
            >
              <Text style={[styles.roleText, role === "parent" && styles.roleTextActive]}>👨‍👩 Adulte</Text>
            </Pressable>
            <Pressable
              testID="role-child-button"
              onPress={() => { setRole("child"); setAvatar(AVATARS_CHILD[0]); }}
              style={[styles.roleChip, role === "child" && styles.roleChipActive]}
            >
              <Text style={[styles.roleText, role === "child" && styles.roleTextActive]}>🧒 Enfant</Text>
            </Pressable>
          </View>
 
          <View style={styles.card}>
            <Text style={styles.label}>Prénom</Text>
            <TextInput testID="register-name-input" value={name} onChangeText={setName}
              placeholder="Léa" placeholderTextColor={T.onSurfaceMuted} style={styles.input} />
 
            <Text style={styles.label}>Email</Text>
            <TextInput testID="register-email-input" value={email} onChangeText={setEmail}
              placeholder="ton.email@exemple.fr" placeholderTextColor={T.onSurfaceMuted}
              autoCapitalize="none" keyboardType="email-address" style={styles.input} />
 
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput testID="register-password-input" value={password} onChangeText={setPassword}
              placeholder="6 caractères min." placeholderTextColor={T.onSurfaceMuted}
              secureTextEntry style={styles.input} />
 
            <Text style={styles.label}>Choisis ton avatar</Text>
            <View style={styles.avatarRow}>
              {avatars.map((a) => (
                <Pressable key={a} testID={`avatar-${a}`} onPress={() => setAvatar(a)}
                  style={[styles.avatarBtn, avatar === a && styles.avatarBtnActive]}>
                  <Text style={{ fontSize: 26 }}>{a}</Text>
                </Pressable>
              ))}
            </View>
 
            {role === "parent" ? (
              <>
                <Text style={styles.label}>Type de compte adulte</Text>
                <View style={styles.modeRow}>
                  <Pressable testID="parent-mode-new" onPress={() => setParentMode("new")}
                    style={[styles.modeChip, parentMode === "new" && styles.modeChipActive]}>
                    <Text style={[styles.modeText, parentMode === "new" && styles.modeTextActive]}>🏠 Nouvelle tribu</Text>
                  </Pressable>
                  <Pressable testID="parent-mode-join" onPress={() => setParentMode("join")}
                    style={[styles.modeChip, parentMode === "join" && styles.modeChipActive]}>
                    <Text style={[styles.modeText, parentMode === "join" && styles.modeTextActive]}>🤝 Rejoindre une tribu</Text>
                  </Pressable>
                </View>
 
                {parentMode === "new" ? (
                  <>
                    <Text style={styles.label}>Nom de la tribu</Text>
                    <TextInput testID="register-familyname-input" value={familyName} onChangeText={setFamilyName}
                      placeholder="Tribu Dupont" placeholderTextColor={T.onSurfaceMuted} style={styles.input} />
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>{"Code tribu (fourni par l'autre adulte)"}</Text>
                    <TextInput testID="register-parent-familyid-input" value={familyId} onChangeText={setFamilyId}
                      placeholder="collez le code tribu" placeholderTextColor={T.onSurfaceMuted}
                      autoCapitalize="none" style={styles.input} />
                    <Text style={styles.helper}>Vous aurez les mêmes droits que le adulte qui a créé la tribu.</Text>
                  </>
                )}
 
                <Text style={styles.label}>Code PIN adulte (6 chiffres)</Text>
                <TextInput testID="register-pin-input" value={pin} onChangeText={setPin}
                  placeholder="123456" placeholderTextColor={T.onSurfaceMuted}
                  keyboardType="number-pad" maxLength={6} secureTextEntry style={styles.input} />
              </>
            ) : (
              <>
                <Text style={styles.label}>Code tribu (fourni par un adulte)</Text>
                <TextInput testID="register-familyid-input" value={familyId} onChangeText={setFamilyId}
                  placeholder="collez le code tribu" placeholderTextColor={T.onSurfaceMuted}
                  autoCapitalize="none" style={styles.input} />
              </>
            )}
 
            {err ? <Text style={styles.err} testID="register-error">{err}</Text> : null}
            {verifyUrl ? (
              <View style={styles.verifyBanner} testID="register-verify-banner">
                <Text style={styles.verifyTitle}>📧 Vérifie ton email</Text>
                <Text style={styles.verifySub}>
                  Un mail de confirmation vient d'être envoyé. En mode dev, clique sur le lien ci-dessous pour confirmer :
                </Text>
                <Text style={styles.verifyLink} selectable onPress={() => router.push(verifyUrl as any)}>
                  {verifyUrl}
                </Text>
                <Pressable testID="register-verify-go" onPress={() => router.push(verifyUrl as any)} style={styles.verifyBtn}>
                  <Text style={styles.verifyBtnText}>Ouvrir le lien de confirmation</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable testID="register-submit-button" onPress={onSubmit} disabled={busy}
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}>
              <Text style={styles.btnText}>{busy ? "Création..." : "C'est parti !"}</Text>
            </Pressable>
 
            <Link href="/(auth)/login" asChild>
              <Pressable testID="go-login-button" style={styles.linkBtn}>
                <Text style={styles.linkText}>{"J'ai déjà un compte"}</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
 
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  scroll: { padding: S.lg, gap: S.md },
  title: { fontSize: 28, fontWeight: "900", color: T.onSurface, marginTop: S.sm },
  roleRow: { flexDirection: "row", gap: S.sm },
  roleChip: { flex: 1, paddingVertical: 14, borderRadius: R.pill, borderWidth: 2, borderColor: T.border, alignItems: "center", backgroundColor: T.white },
  roleChipActive: { backgroundColor: T.brand, borderColor: T.brandDark },
  roleText: { fontWeight: "800", color: T.onSurface, fontSize: 15 },
  roleTextActive: { color: T.white },
  card: { backgroundColor: T.white, padding: S.lg, borderRadius: R.lg, borderWidth: 2, borderColor: T.border, gap: S.sm },
  label: { color: T.onSurface, fontWeight: "700", marginTop: S.sm, fontSize: 13 },
  helper: { color: T.onSurfaceMuted, fontSize: 12, marginTop: S.xs, fontStyle: "italic" },
  modeRow: { flexDirection: "row", gap: S.sm, marginTop: 4 },
  modeChip: { flex: 1, paddingVertical: 12, borderRadius: R.pill, borderWidth: 2, borderColor: T.border, backgroundColor: T.white, alignItems: "center" },
  modeChipActive: { backgroundColor: T.brand, borderColor: T.brandDark },
  modeText: { fontWeight: "800", color: T.onSurface, fontSize: 13 },
  modeTextActive: { color: T.white },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 14, fontSize: 16, color: T.onSurface, borderWidth: 2, borderColor: T.border },
  avatarRow: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  avatarBtn: { width: 52, height: 52, borderRadius: R.md, backgroundColor: T.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: T.border },
  avatarBtnActive: { borderColor: T.brand, backgroundColor: "#EFFBE0" },
  err: { color: T.red, fontWeight: "700", marginTop: S.xs },
  verifyBanner: { backgroundColor: "#FFF7E0", borderRadius: R.md, padding: S.md, borderWidth: 2, borderColor: T.orange, gap: 4, marginTop: S.sm },
  verifyTitle: { fontWeight: "900", color: T.onSurface, fontSize: 14 },
  verifySub: { color: T.onSurfaceMuted, fontSize: 12, lineHeight: 18 },
  verifyLink: { color: T.brand, fontSize: 11, marginTop: 4, fontWeight: "700" },
  verifyBtn: { backgroundColor: T.brand, paddingVertical: 10, borderRadius: R.pill, alignItems: "center", marginTop: 6, borderBottomWidth: 3, borderBottomColor: T.brandDark },
  verifyBtnText: { color: T.white, fontWeight: "900", fontSize: 13 },
  btn: { backgroundColor: T.brand, borderRadius: R.pill, paddingVertical: 16, alignItems: "center", marginTop: S.md, borderBottomWidth: 4, borderBottomColor: T.brandDark },
  btnText: { color: T.white, fontSize: 17, fontWeight: "900" },
  linkBtn: { alignItems: "center", padding: S.md },
  linkText: { color: T.brand, fontWeight: "800", fontSize: 15 },
});