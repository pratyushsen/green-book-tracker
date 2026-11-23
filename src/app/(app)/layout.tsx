import { DataProvider } from "@/lib/data/store";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}
