export type Network = "LinkedIn" | "X" | "Instagram" | "Facebook";
export interface Size {
  id: string;
  net: Network;
  name: string;
  w: number;
  h: number;
}

// Common recommended upload sizes. Platforms change these from time to time.
export const SIZES: Size[] = [
  { id: "li-post", net: "LinkedIn", name: "Post image", w: 1200, h: 627 },
  { id: "li-square", net: "LinkedIn", name: "Square", w: 1200, h: 1200 },
  { id: "li-portrait", net: "LinkedIn", name: "Portrait", w: 1080, h: 1350 },
  { id: "x-post", net: "X", name: "Post image", w: 1600, h: 900 },
  { id: "x-square", net: "X", name: "Square", w: 1080, h: 1080 },
  { id: "ig-square", net: "Instagram", name: "Square", w: 1080, h: 1080 },
  { id: "ig-portrait", net: "Instagram", name: "Portrait", w: 1080, h: 1350 },
  { id: "ig-story", net: "Instagram", name: "Story", w: 1080, h: 1920 },
  { id: "fb-post", net: "Facebook", name: "Feed post", w: 1200, h: 630 },
  { id: "fb-square", net: "Facebook", name: "Square", w: 1080, h: 1080 },
];

export const NETWORKS: Network[] = ["LinkedIn", "X", "Instagram", "Facebook"];
export const CAPTION_LIMITS: Record<Network, number> = { LinkedIn: 3000, X: 280, Instagram: 2200, Facebook: 63206 };
export const sizeById = (id: string) => SIZES.find((s) => s.id === id) ?? SIZES[0];
