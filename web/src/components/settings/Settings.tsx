import { Toaster } from "@/components/ui/sonner";
import { Shell } from "@/components/shell/Rail";
import { BootScreen } from "@/components/studio/BootScreen";
import { SessionProvider } from "@/components/studio/SessionProvider";
import { api } from "@/lib/api";
import { studioHref } from "@/lib/nav";
import { useLibraryBoot, type LibraryBoot } from "@/lib/useLibraryBoot";
import { useTheme } from "@/lib/useTheme";

/** A settings address visited directly: the frame, with the settings dialog open over it (`SettingsDialog.tsx`). */
export default function Settings() {
  const { boot, retry, submitToken } = useLibraryBoot();
  if (boot.status !== "ready") return <BootScreen boot={boot} retry={retry} submitToken={submitToken} />;
  return <SessionProvider initial={boot.data.session}><Page data={boot.data} /></SessionProvider>;
}

function Page({ data }: { data: LibraryBoot }) {
  const [theme, toggleTheme] = useTheme();
  const switchBrand = (id: string) => { void api.putPreference("activeProfile", id).then(() => { window.location.href = studioHref(); }); };
  return (
    <>
      <Toaster theme={theme} />
      <Shell area="settings" brands={data.profiles} activeId={data.activeId} colors={data.colors} onSwitchBrand={switchBrand} theme={theme} onToggleTheme={toggleTheme}>
        <main className="min-h-0 min-w-0 flex-1" />
      </Shell>
    </>
  );
}
