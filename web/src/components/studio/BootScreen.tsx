import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Boot } from "@/lib/boot";
import { API_BASE } from "@/lib/api";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 10 10"><path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" className="fill-brand" /></svg>
          <span className="font-mono text-[12.5px] font-bold uppercase tracking-[0.14em]">CardPress</span>
        </div>
        <h1 className="mb-3 text-base font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function BootScreen(props: {
  boot: Exclude<Boot, { status: "ready" }>;
  retry: () => void;
  submitToken: (t: string) => void;
}) {
  const { boot } = props;
  const [token, setToken] = useState("");

  if (boot.status === "loading") {
    return <Shell title="Loading"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Connecting to the server…</div></Shell>;
  }
  if (boot.status === "error") {
    return (
      <Shell title="Cannot reach the server">
        <p className="mb-4 text-sm text-muted-foreground">{boot.message}. Is the server running at {API_BASE}?</p>
        <Button variant="brand" size="sm" onClick={props.retry}>Try again</Button>
      </Shell>
    );
  }
  return (
    <Shell title="This server needs an access token">
      <form onSubmit={(e) => { e.preventDefault(); if (token.trim()) props.submitToken(token); }} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="tok">Access token</Label>
          <Input id="tok" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
          {boot.error && <p className="text-xs text-destructive">{boot.error}</p>}
          <p className="text-xs text-muted-foreground">Set as CARDPRESS_API_TOKEN on the server. Asked for again after a reload.</p>
        </div>
        <Button type="submit" variant="brand" size="sm" disabled={!token.trim()}>Continue</Button>
      </form>
    </Shell>
  );
}
