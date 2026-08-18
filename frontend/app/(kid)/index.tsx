import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { T, S, R } from "@/src/lib/theme";
import { Card, PointsPill, StreakPill, EmptyState } from "@/src/components/UI";

export default function KidHome() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [top, setTop] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [t, lb] = await Promise.all([api.get("/tasks"), api.get("/family/leaderboard")]);
      setTasks(t.tasks || []);
      setTop((lb.members || []).slice(0, 3));
      await refresh();
    } catch {}
  }, [refresh]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const myTasks = tasks.filter((t: any) =>
    (t.assigned_to?.length === 0) || t.assigned_to.includes(user?.id)
  );
  const todoCount = myTasks.filter(t => t.today_status === "todo").length;
  const doneCount = myTasks.filter(t => t.today_status !== "todo").length;
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
          <Text style={s.sectionTitle}>🏆 Podium hebdomadaire</Text>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
