import { SiteHeader } from "@/components/site-header";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-theme min-h-screen">
      <div className="grid-fade min-h-screen">
        <SiteHeader />
        {children}
      </div>
    </div>
  );
}
