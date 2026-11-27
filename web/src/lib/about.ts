import type { ApiInfo } from "./api";

export interface AboutPart { title: string; lines: [name: string, value: string][] }

const day = (iso?: string) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 10) : "");

/** What About shows of a server, from what the server says of itself. A line it did not say is left out. */
export function aboutParts(info: ApiInfo): AboutPart[] {
  const said = (lines: [string, string | undefined][]) => lines.filter((l): l is [string, string] => !!l[1]);
  const build = [info.build?.commit?.slice(0, 7), day(info.build?.date)].filter(Boolean).join(" · ");
  const parts: AboutPart[] = [{ title: "CardPress", lines: said([["Version", info.version], ["Build", build], ["Database", info.db === "sqlite" ? "SQLite" : info.db === "libsql" ? "libSQL" : info.db]]) }];
  const a = info.agent;
  parts.push({ title: "Assistant", lines: said([
    ["Status", a?.ready ? "Connected" : "Not set up"],
    ["Name", a?.ready ? a.name : undefined],
    ["Agent version", a?.version],
    ["Content schema", a?.schemaVersion ? String(a.schemaVersion) : undefined],
  ]) });
  return parts;
}

/** The same as plain lines, to paste into a problem report. */
export const aboutText = (parts: AboutPart[]) => parts.map((p) => [p.title, ...p.lines.map(([n, v]) => `  ${n}: ${v}`)].join("\n")).join("\n");
