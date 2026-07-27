import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { ProofreadPanel } from "@/components/ProofreadPanel";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function Workspace() {
  usePageTitle("校对");
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <ProofreadPanel />
      </div>
      <Footer />
    </AppShell>
  );
}
