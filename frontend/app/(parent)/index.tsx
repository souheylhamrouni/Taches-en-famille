import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { Card, PointsPill, StreakPill, EmptyState, ScreenHeader } from "@/src/components/UI";
 
 
export default function ParentDashboard() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<any[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [claims, setClaims] = useState<any[]>([]);
  const [family, setFamily] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [badges, setBadges] = useState<{ unlocked_count: number; total: number; list: any[] }>({ unlocked_count: 0, total: 0, list: [] });
  const [challenge, setChallenge] = useState<any>(null);
 
  const load = useCallback(async () => {
    try {
      const [p, lb, pen, cl, fam, t, bg, ch] = await Promise.all([
        api.get("/completions/pending"),
        api.get("/family/leaderboard"),
        api.get("/penalties"),
        api.get("/claims"),
        api.get("/family"),
        api.get("/tasks"),
        api.get("/badges"),
        api.get("/challenges")
      ]);
      setPending(p.completions || []);
      setTop((lb.members || []).slice(0, 3));
      setPenalties((pen.penalties || []).slice(0, 5));
      setClaims((cl.claims || []).slice(0, 5));
      setFamily(fam.family);
      setTasks(t.tasks || []);
      setBadges({ unlocked_count: bg.unlocked_count || 0, total: bg.total || 0, list: (bg.badges || []).filter((b: any) => b.unlocked).slice(-4) });
      setChallenge(ch.challenge || null);
    } catch {}
  }, []);
 
 
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
 
  const myTasks = tasks.filter((t: any) =>
    (t.assigned_to?.length === 0) || t.assigned_to.includes(user?.id)
  );
  const todoCount = myTasks.filter(t => t.today_status === "todo").length;
  const doneCount = myTasks.filter(t => t.today_status !== "todo").length;
  const progress = myTasks.length ? doneCount / myTasks.length : 0;
 
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title={`Bonjour ${user?.name}`} subtitle={family?.name || "Tableau de bord"} />
      <ScrollView
        contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.orange} />}
      >
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <StatBox label="À valider" value={pending.length} color={T.orange} onPress={() => router.push("/shared/validate")} testID="stat-pending" />
          <StatBox label="Cadeaux" value={claims.length} color={T.brand} onPress={() => router.push("/(parent)/rewards-admin")}testID="stat-claims" />
          <StatBox label="Pénalités" value={penalties.length} color={T.red} testID="stat-penalties" />
        </View>
 
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
         <View>
          <Text style={s.sectionTitle}>🎯 À faire maintenant</Text>
          {myTasks.filter(t => t.today_status === "todo").slice(0, 4).map((t: any) => (
            <Pressable
              key={t.id}
              testID={`home-task-${t.id}`}
              onPress={() => router.push("/shared/mytasks")}
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
          <Text style={s.sectionTitle}>🏆 Top de la semaine</Text>
          <Pressable testID="leaderboard-card" onPress={() => router.push("/shared/leaderboard")}>
            <Card>
              {top.length === 0 ? <Text style={s.hint}>Pas encore de leaders</Text> :
                top.map((m, i) => (
                  <View key={m.id} style={s.row}>
                    <Text style={{ fontSize: 24, width: 32 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</Text>
                    <Text style={{ fontSize: 22 }}>{m.avatar}</Text>
                    <Text style={s.rowName}>{m.name}</Text>
                    <Text style={s.rowPts}>{m.points} pts · 🔥{m.streak}</Text>
                  </View>
                ))
              }
            </Card>
          </Pressable>
        </View>
 
        <View>
          <Text style={s.sectionTitle}>⚡ Raccourcis</Text>
          <View style={s.shortcuts}>
            <Shortcut icon="checkmark-done-circle" label="Valider" onPress={() => router.push("/shared/validate")} testID="short-validate" badge={pending.length} />
            <Shortcut icon="flame" label="Mes tâches" onPress={() => router.push("/shared/mytasks")} testID="short-mytasks" />
            <Shortcut icon="gift" label="Cadeau" onPress={() => router.push("/shared/myrewards")} testID="short-myrewards" />
            <Shortcut icon="flag" label="Défi" onPress={() => router.push("/shared/challenges")} testID="short-challenge" />
          </View>
          <View style={[s.shortcuts, { marginTop: S.sm }]}>
            <Shortcut icon="calendar" label="Calendrier" onPress={() => router.push("/shared/calendar")} testID="short-calendar" />
            <Shortcut icon="cart" label="Courses" onPress={() => router.push("/shared/shopping")} testID="short-shopping" />
            <Shortcut icon="people" label="Membres" onPress={() => router.push("/shared/members")} testID="short-members" />
          </View>
        </View>
 
        {penalties.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>⚠️ Pénalités récentes</Text>
            <Card>
              {penalties.map(p => (
                <View key={p.id} style={s.penaltyRow}>
                  <Ionicons name="alert-circle" size={18} color={T.red} />
                  <Text style={s.penaltyText}>{p.user_name} · {p.task_title}</Text>
                  <Text style={s.penaltyPts}>-{p.points_deducted}</Text>
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
 
function StatBox({ label, value, color, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.stat, { borderColor: color }, pressed && { opacity: 0.85 }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Pressable>
  );
}
function Shortcut({ icon, label, onPress, testID, badge }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.shortcut, pressed && { opacity: 0.85 }]}>
      <View style={s.shortIcon}><Ionicons name={icon} size={24} color={T.orange} /></View>
      <Text style={s.shortLabel} numberOfLines={1}>{label}</Text>
      {badge > 0 ? <View style={s.shortBadge}><Text style={s.shortBadgeText}>{badge}</Text></View> : null}
    </Pressable>
  );
}
 
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  stat: { flex: 1, backgroundColor: T.white, padding: S.md, borderRadius: R.lg, borderWidth: 2, alignItems: "center" },
  statValue: { fontSize: 26, fontWeight: "900" },
  statLabel: { fontSize: 11, color: T.onSurfaceMuted, marginTop: 2, fontWeight: "700" },
  cardTitle: { fontWeight: "900", fontSize: 16, color: T.onSurface },
  codeBox: { backgroundColor: T.surfaceSecondary, marginTop: S.sm, padding: S.md, borderRadius: R.md, borderWidth: 2, borderColor: T.border },
  codeText: { fontWeight: "800", color: T.onSurface, fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: T.onSurface, marginBottom: S.sm },
  row: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: S.sm },
  rowName: { flex: 1, fontWeight: "800", color: T.onSurface },
  rowPts: { fontWeight: "800", color: T.brand },
  shortcuts: { flexDirection: "row", gap: S.sm },
  shortcut: { flex: 1, backgroundColor: T.white, padding: S.sm, borderRadius: R.lg, borderWidth: 2, borderColor: T.border, alignItems: "center", gap: 4 },
  shortIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  shortLabel: { fontWeight: "800", fontSize: 11, color: T.onSurface },
  shortBadge: { position: "absolute", top: 6, right: 6, backgroundColor: T.red, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  shortBadgeText: { color: T.white, fontWeight: "900", fontSize: 11 },
  hint: { color: T.onSurfaceMuted, textAlign: "center", padding: S.sm },
  penaltyRow: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 8 },
  penaltyText: { flex: 1, color: T.onSurface, fontWeight: "700", fontSize: 13 },
  penaltyPts: { color: T.red, fontWeight: "900" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: S.md },
  hello: { color: T.onSurfaceMuted, fontSize: 15, fontWeight: "700" },
  name: { color: T.onSurface, fontWeight: "900", fontSize: 26, letterSpacing: -0.5 },
  progressText: { fontWeight: "900", color: T.brand },
  progressTrack: { height: 14, backgroundColor: T.surfaceSecondary, borderRadius: R.pill, overflow: "hidden", borderWidth: 2, borderColor: T.border },
  progressFill: { height: "100%", backgroundColor: T.brand, borderRadius: R.pill },
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
