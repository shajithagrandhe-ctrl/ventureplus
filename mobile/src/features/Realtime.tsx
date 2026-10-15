import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";

const refreshIntervalMs = 30_000;

export function Realtime() {
  const { user } = useAuth();
  const cache = useQueryClient();
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = () => { void cache.invalidateQueries({ queryKey: ["business", user.id] }); };
    const start = () => {
      if (timer || AppState.currentState !== "active") return;
      refresh();
      timer = setInterval(refresh, refreshIntervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    start();
    const subscription = AppState.addEventListener("change", state => {
      stop();
      if (state === "active") start();
    });
    return () => { stop(); subscription.remove(); };
  }, [user, cache]);
  return null;
}
