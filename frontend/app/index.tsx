import { View, ActivityIndicator, StyleSheet } from "react-native";
import { T } from "@/src/lib/theme";

export default function Index() {
  return (
    <View style={styles.c}>
      <ActivityIndicator color={T.brand} size="large" />
    </View>
  );
}
const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: T.surface, alignItems: "center", justifyContent: "center" },
});
