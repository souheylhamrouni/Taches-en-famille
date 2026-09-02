import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";

type State = "loading" | "success" | "already" | "error";

export default function VerifyEmail() {
  const router = useRouter();
  const { token, id } = useLocalSearchParams<{ token?: string; id?: string }>();
  const [state, setState] = useState<State>("loading");
  const [errMsg, setErrMsg] = useState<string>("");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (!token || !id) {
        setState("error");
        setErrMsg("Lien incomplet. Vérifie l'URL du mail.");
        return;
      }
      try {
        const r = await api.get(`/auth/verify-email?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`);
        setName(r.name || "");
        setState(r.already_verified ? "already" : "success");
      } catch (e: any) {
        setState("error");
        setErrMsg(e?.message || "Impossible de valider le lien.");
      }
    })();
  }, [token, id]);

  const goLogin = () => router.replace("/(auth)/login");
  const goHome = () => router.replace("/");

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.container}>
        <View style={s.iconBox}>
          {state === "loading" ? (
            <ActivityIndicator size="large" color={T.brand} />
          ) : state === "success" ? (
            <Text style={{ fontSize: 80 }}>🎉</Text>
          ) : state === "already" ? (
            <Text style={{ fontSize: 80 }}>✅</Text>
          ) : (
            <Text style={{ fontSize: 80 }}>😕</Text>
          )}
        </View>

        <Text style={s.title}>
          {state === "loading" && "Vérification en cours…"}
          {state === "success" && `Bienvenue ${name} !`}
          {state === "already" && "Déjà confirmé !"}
          {state === "error" && "Oups, lien invalide"}
        </Text>

        <Text style={s.sub}>
          {state === "loading" && "On contrôle ton lien de confirmation…"}
          {state === "success" && "Ton adresse email a bien été confirmée. Tu peux maintenant te connecter et démarrer l'aventure avec ta tribu."}
          {state === "already" && "Ton email a déjà été confirmé. Tu peux te connecter."}
          {state === "error" && errMsg}
        </Text>

        {state !== "loading" && (
          <Pressable testID="verify-go-login" onPress={goLogin} style={s.btn}>
            <Ionicons name="log-in" size={18} color={T.white} />
            <Text style={s.btnText}>Se connecter</Text>
          </Pressable>
        )}

        {state === "error" && (
          <Pressable testID="verify-go-home" onPress={goHome} style={s.linkBtn}>
            <Text style={s.linkText}>Retour à l'accueil</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: S.xl, gap: S.lg },
  iconBox: { width: 140, height: 140, borderRadius: 70, backgroundColor: T.white, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: T.border },
  title: { fontSize: 26, fontWeight: "900", color: T.onSurface, textAlign: "center" },
  sub: { fontSize: 15, color: T.onSurfaceMuted, textAlign: "center", lineHeight: 22, maxWidth: 360 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.brand, paddingVertical: 14, paddingHorizontal: S.xl, borderRadius: R.pill, borderBottomWidth: 3, borderBottomColor: T.brandDark, marginTop: S.md },
  btnText: { color: T.white, fontWeight: "900", fontSize: 15 },
  linkBtn: { padding: S.sm },
  linkText: { color: T.brand, fontWeight: "700", textDecorationLine: "underline" },
});
