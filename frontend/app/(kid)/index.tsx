import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { Card, PointsPill, StreakPill, EmptyState, ScreenHeader } from "@/src/components/UI";
import TodayEvents from "../shared/today-events";
 
export default function KidHome() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [top, setTop] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [badges, setBadges] = useState<{ unlocked_count: number; total: number; list: any[] }>({ unlocked_count: 0, total: 0, list: [] });
  const [challenge, setChallenge] = useState<any>(null);
 
  const load = useCallback(async () => {
    try {
      const [t, lb, bg, ch,fam] = await Promise.all([api.get("/tasks"), api.get("/family/leaderboard"), api.get("/badges"), api.get("/challenges"), api.get("/family/leaderboard"),]);
      setTasks(t.tasks || []);
      setTop((lb.members || []).slice(0, 3));
      setBadges({ unlocked_count: bg.unlocked_count || 0, total: bg.total || 0, list: (bg.badges || []).filter((b: any) => b.unlocked).slice(-4) });
      setChallenge(ch.challenge || null);
      setFamily(fam.family);
      await refresh();
    } catch {}
  }, [refresh]);
 
  useFocusEffect(useCallback(() => { load(); }, [load]));
 
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
 
  const myTasks = tasks.filter((t: any) =>
    (t.assigned_to?.length === 0) || t.assigned_to.includes(user?.id)
  );
  const todoCount = myTasks.filter(t => t.today_status === "todo").length;
  const doneCount = myTasks.filter(t => t.today_status !== "todo" && t.today_status !== "claimed").length;
  const progress = myTasks.length ? doneCount / myTasks.length : 0;
 
  if (!user) return null;
 
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}
      >
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.hello}>Salut,</Text>
            <Text style={s.name} testID="kid-name">{user.avatar} {user.name} !</Text>
          </View>
          <View style={{ gap: S.xs }}>
            <PointsPill value={user.points} />
            <StreakPill value={user.streak} />
          </View>
        </View>
 
        <TodayEvents onPress={() => router.push("/shared/calendar")} />
        <Card testID="progress-card">

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: S.sm }}>
            <Text style={s.cardTitle}>Ma quête du jour</Text>
            <Text style={s.progressText}>{doneCount}/{myTasks.length}</Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={s.hint}>
            {todoCount === 0 && myTasks.length > 0 ? "🎉 Toutes les tâches faites !" :
              todoCount > 0 ? `⏰ ${todoCount} tâche(s) avant 20h` : "Aucune tâche pour aujourd'hui"}
          </Text>
        </Card>
 
        {challenge && (
          <Pressable testID="challenge-banner" onPress={() => router.push("/shared/challenges")}
            style={({ pressed }) => [s.challengeBanner, challenge.status === "completed" && s.challengeDone, pressed && { opacity: 0.9 }]}>
            <Text style={{ fontSize: 34 }}>{challenge.status === "completed" ? "🏆" : "🎯"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.challengeTitle}>Défi : {challenge.title}</Text>
              <View style={s.challengeTrack}>
                <View style={[s.challengeFill, { width: `${Math.min(100, Math.round((challenge.percent || 0) * 100))}%`, backgroundColor: challenge.status === "completed" ? T.gold : T.white }]} />
              </View>
              <Text style={s.challengeSub}>
                {challenge.progress}/{challenge.target} {challenge.metric === "points" ? "points" : "tâches"} · bonus +{challenge.bonus_points}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={T.white} />
          </Pressable>
        )}
 
        <View style={s.kidShortcuts}>
          <Pressable testID="kid-shortcut-calendar" onPress={() => router.push("/shared/calendar")}
            style={({ pressed }) => [s.kidShortcut, pressed && { opacity: 0.9 }]}>
            <Ionicons name="calendar" size={22} color={T.brand} />
            <Text style={s.kidShortcutText}>Calendrier</Text>
          </Pressable>
          <Pressable testID="kid-shortcut-shopping" onPress={() => router.push("/shared/shopping")}
            style={({ pressed }) => [s.kidShortcut, pressed && { opacity: 0.9 }]}>
            <Ionicons name="cart" size={22} color={T.brand} />
            <Text style={s.kidShortcutText}>Courses</Text>
          </Pressable>
        </View>
 
        <View>
          <Text style={s.sectionTitle}>🎯 À faire maintenant</Text>
          {myTasks.filter(t => t.today_status === "todo").slice(0, 4).map((t: any) => (
            <Pressable
              key={t.id}
              testID={`home-task-${t.id}`}
              onPress={() => router.push("/(kid)/tasks")}
              style={({ pressed }) => [s.taskRow, pressed && { opacity: 0.9 }]}
            >
              <View style={s.taskIcon}><Ionicons name="ellipse-outline" size={22} color={T.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.taskTitle}>{t.title}</Text>
                <Text style={s.taskSub}>{t.photo_required ? "📸 Photo requise" : "Simple"}</Text>
              </View>
              <View style={s.pointsBadge}><Text style={s.pointsBadgeText}>+{t.points_worth}</Text></View>
            </Pressable>
          ))}
          {myTasks.filter(t => t.today_status === "todo").length === 0 && (
            <EmptyState emoji="😴" title="Aucune quête aujourd'hui !" subtitle="Reviens demain pour de nouvelles missions" />
          )}
        </View>
  
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm }}>
            <Text style={s.sectionTitle}>🏅 Mes badges</Text>
            <Pressable testID="see-all-badges" onPress={() => router.push("/shared/badges")}>
              <Text style={s.seeAll}>Voir tout ({badges.unlocked_count}/{badges.total})</Text>
            </Pressable>
          </View>
          <Pressable testID="badges-card" onPress={() => router.push("/shared/badges")}>
            <Card>
              {badges.list.length === 0 ? (
                <Text style={s.hint}>Termine des tâches pour gagner tes premiers badges !</Text>
              ) : (
                <View style={{ flexDirection: "row", gap: S.md }}>
                  {badges.list.map((b: any) => (
                    <View key={b.id} style={s.badgeChip}>
                      <Text style={{ fontSize: 34 }}>{b.emoji}</Text>
                      <Text style={s.badgeChipText} numberOfLines={1}>{b.title}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </Pressable>
        </View>
 
        <View>
          <Text style={s.sectionTitle}>🏆 Podium hebdomadaire</Text>
          <Pressable testID="leaderboard-card" onPress={() => router.push("/shared/leaderboard")}>
          <Card>
            {top.length === 0 ? <Text style={s.hint}>Pas encore de classement</Text> : (
              top.map((m, i) => (
                <View key={m.id} style={s.podiumRow}>
                  <Text style={{ fontSize: 24, width: 36 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</Text>
                  <Text style={{ fontSize: 22 }}>{m.avatar}</Text>
                  <Text style={[s.podiumName, m.id === user.id && { color: T.brand }]}>{m.name}</Text>
                  <Text style={s.podiumPts}>{m.points} pts</Text>
                </View>
              ))
            )}
          </Card>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
 
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  headerRow: { flexDirection: "row", alignItems: "center", gap: S.md },
  hello: { color: T.onSurfaceMuted, fontSize: 15, fontWeight: "700" },
  name: { color: T.onSurface, fontWeight: "900", fontSize: 26, letterSpacing: -0.5 },
  cardTitle: { fontWeight: "900", fontSize: 16, color: T.onSurface },
  progressText: { fontWeight: "900", color: T.brand },
  progressTrack: { height: 14, backgroundColor: T.surfaceSecondary, borderRadius: R.pill, overflow: "hidden", borderWidth: 2, borderColor: T.border },
  progressFill: { height: "100%", backgroundColor: T.brand, borderRadius: R.pill },
  hint: { color: T.onSurfaceMuted, marginTop: S.sm, fontWeight: "600", fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: T.onSurface, marginBottom: S.sm },
  seeAll: { color: T.brand, fontWeight: "800", fontSize: 13 },
  challengeBanner: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: T.brand, borderRadius: R.lg, padding: S.md, borderBottomWidth: 4, borderBottomColor: T.brandDark },
  challengeDone: { backgroundColor: T.orange, borderBottomColor: "#C77500" },
  challengeTitle: { color: T.white, fontWeight: "900", fontSize: 15 },
  challengeTrack: { height: 10, backgroundColor: "rgba(255,255,255,0.35)", borderRadius: R.pill, overflow: "hidden", marginVertical: 6 },
  challengeFill: { height: "100%", borderRadius: R.pill },
  challengeSub: { color: T.white, fontWeight: "700", fontSize: 12, opacity: 0.95 },
  kidShortcuts: { flexDirection: "row", gap: S.sm },
  kidShortcut: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, backgroundColor: T.white, paddingVertical: 14, borderRadius: R.lg, borderWidth: 2, borderColor: T.border },
  kidShortcutText: { fontWeight: "800", color: T.onSurface, fontSize: 14 },
  badgeChip: { flex: 1, alignItems: "center", gap: 4 },
  badgeChipText: { fontSize: 11, fontWeight: "800", color: T.onSurface, textAlign: "center" },
  taskRow: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, borderColor: T.border, marginBottom: S.sm },
  taskIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EFFBE0", alignItems: "center", justifyContent: "center" },
  taskTitle: { fontWeight: "800", color: T.onSurface, fontSize: 15 },
  taskSub: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  pointsBadge: { backgroundColor: T.gold, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill },
  pointsBadgeText: { fontWeight: "900", color: T.onSurface, fontSize: 13 },
  podiumRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: S.sm },
  podiumName: { flex: 1, fontWeight: "800", color: T.onSurface, fontSize: 15 },
  podiumPts: { color: T.onSurfaceMuted, fontWeight: "800" },
});
