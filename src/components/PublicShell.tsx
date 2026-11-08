import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 lab-grid opacity-80" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-10%,rgba(45,212,191,0.14),transparent),radial-gradient(ellipse_50%_30%_at_100%_20%,rgba(251,191,36,0.08),transparent)]" />
      <SiteHeader />
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}
