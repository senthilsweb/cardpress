import { useEffect, useState } from "react";

/** Whether a CSS media query matches, following the window as it changes. */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(query).matches));
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
