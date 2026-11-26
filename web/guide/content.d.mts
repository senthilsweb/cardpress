export const GROUPS: { name: string; pages: [string, string][] }[];
export const PAGES: [string, string][];
export function sections(html: string): { body: string; found: { id: string; text: string }[] };
export interface Entry { slug: string; anchor: string; p: string; h: string; t: string }
export function searchIndex(read: (slug: string) => string): Entry[];
export function search(index: Entry[], query: string, most?: number): (Entry & { snippet: string })[];
