import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/lib/auth";
import { BACKEND_URL, storage } from "@/src/lib/api";
import WebSecurityHeaders from "@/src/lib/web-security";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
      shouldShowBanner: true, shouldShowList: true,
    } as any),
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Défaut",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function AuthedGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    const inKid = segments[0] === "(kid)";
    const inParent = segments[0] === "(parent)";
    const inShared = segments[0] === "shared";
    if (!user && !inAuth) {
      router.replace("/(auth)/login");
    } else if (user && !inShared) {
      if (user.role === "parent" && !inParent) router.replace("/(parent)");
      if (user.role === "child" && !inKid) router.replace("/(kid)");
    }
  }, [user, loading, segments]);

  useEffect(() => {
    if (Platform.OS === "web" || !user) return;
    (async () => {
      try {
        const perm = await Notifications.requestPermissionsAsync();
        if (perm.status !== "granted") return;
        const tok = await Notifications.getDevicePushTokenAsync();
        const jwt = await storage.get("access_token");
        await fetch(`${BACKEND_URL}/api/register-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
          body: JSON.stringify({ user_id: user.id, platform: Platform.OS, device_token: tok.data }),
        });
      } catch {}
    })();

    const openDeep = (url: string) => {
      if (url.startsWith("http")) { Linking.openURL(url); } else { router.push(url as any); }
    };
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (url) openDeep(url);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (url) openDeep(url);
    });
    return () => { tapSub.remove(); };
  }, [user]);

  return null;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <WebSecurityHeaders />
          <AuthedGate />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFDF7" } }} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
