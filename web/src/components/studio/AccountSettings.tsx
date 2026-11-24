import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/auth/AuthPage";
import { api } from "@/lib/api";
import { joinDate, roleLabel, splitDate, useSession } from "@/lib/session";

/** Your own details and password. Email and role are changed by an administrator. */
export function AccountSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser } = useSession();
  const [tab, setTab] = useState("profile");
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "" });
  const [dob, setDob] = useState({ y: "", m: "", d: "" });
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // start from what is saved each time the drawer opens
  useEffect(() => {
    if (!open || !user) return;
    setF({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" });
    setDob(splitDate(user.birthDate));
    setPw({ current: "", next: "", again: "" });
    setError(null);
  }, [open, user]);
  if (!user) return null;

  const saveProfile = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.updateMe({ ...f, birthDate: joinDate(dob.y, dob.m, dob.d) });
      setUser(r.user);
      toast.success("Saved");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  };
  const changePassword = async () => {
    if (pw.next !== pw.again) return setError("The two new passwords are not the same.");
    setBusy(true); setError(null);
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", again: "" });
      toast.success("Password changed", { description: "You were signed out on your other devices." });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change the password"); } finally { setBusy(false); }
  };
  const profileReady = f.firstName.trim() !== "" && f.lastName.trim() !== "";
  const pwReady = pw.current !== "" && pw.next.length >= 10 && pw.again !== "";

  return (
    <Drawer
      open={open} onClose={onClose} title="Account settings" resizeKey="account"
      subheader={
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(null); }} className="px-3 py-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <p role="alert" className="mr-auto text-xs text-destructive">{error}</p>}
          {tab === "profile"
            ? <Button variant="brand" size="sm" onClick={() => void saveProfile()} disabled={busy || !profileReady}>{busy && <Loader2 className="animate-spin" />} Save</Button>
            : <Button variant="brand" size="sm" onClick={() => void changePassword()} disabled={busy || !pwReady}>{busy && <Loader2 className="animate-spin" />} Change password</Button>}
        </div>
      }
    >
      <Tabs value={tab} className="space-y-4 p-4">
        <TabsContent value="profile" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="as-first">First name</Label><Input id="as-first" data-autofocus value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="as-last">Last name</Label><Input id="as-last" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="as-email">Email</Label><Input id="as-email" value={user.email} readOnly disabled /></div>
          <div className="space-y-1.5"><Label htmlFor="as-phone">Phone</Label><Input id="as-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Optional" /></div>
          <div className="space-y-1.5"><Label htmlFor="as-dob-day">Date of birth</Label><DatePicker idPrefix="as-dob" {...dob} onChange={setDob} /></div>
          <p className="text-xs text-muted-foreground">Role: {roleLabel(user)}. An administrator can change your email or role.</p>
        </TabsContent>
        <TabsContent value="password" className="mt-0 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="as-cur">Current password</Label><Input id="as-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-new">New password</Label><Input id="as-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /><p className="text-xs text-muted-foreground">At least 10 characters.</p></div>
          <div className="space-y-1.5"><Label htmlFor="as-again">New password again</Label><Input id="as-again" type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></div>
        </TabsContent>
      </Tabs>
    </Drawer>
  );
}
