import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";

/**
 * useCelebration — returns a `celebrate()` fn that plays the festive success
 * chime and fires a success haptic. Safe on web (haptics no-op).
 */
export function useCelebration() {
  const player = useAudioPlayer(require("@/assets/sounds/success.wav"));
  const ready = useRef(false);

  useEffect(() => { ready.current = true; }, []);

  const celebrate = useCallback(() => {
    try {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      player.seekTo(0);
      player.play();
    } catch {}
  }, [player]);

  return celebrate;
}
