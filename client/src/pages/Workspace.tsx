import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { ProofreadPanel } from "@/components/ProofreadPanel";

export default function Workspace() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <ProofreadPanel />
      </div>
      <Footer />
    </AppShell>
  );
}
