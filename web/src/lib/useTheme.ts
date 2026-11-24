import { useEffect, useState } from "react";
import { api } from "./api";

/** The light or dark look, kept on the page and remembered on the server. */
export function useTheme(saved?: "light" | "dark") {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    saved ?? (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light")
  );
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    api.putPreference("theme", next).catch(() => undefined); // a failed save only means the choice is not remembered
  };
  return [theme, toggle] as const;
}
