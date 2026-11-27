import { useEffect } from "react";
import { setMode, useAppearance } from "./appearance";

/** The light or dark look in use, and a switch to the other. The choice is remembered on the server. */
export function useTheme() {
  const { shown, theme } = useAppearance();
  useEffect(() => {
    document.documentElement.dataset.theme = shown;
    document.documentElement.dataset.palette = theme;
  }, [shown, theme]);
  const toggle = () => setMode(shown === "dark" ? "light" : "dark");
  return [shown, toggle] as const;
}
