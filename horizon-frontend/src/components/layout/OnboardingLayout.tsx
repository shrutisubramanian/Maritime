import { Outlet } from "react-router-dom";
import { TopAppBar } from "./TopAppBar";
import { SideProgressPanel } from "./SideProgressPanel";
import { GlobalFooter } from "./GlobalFooter";

export function OnboardingLayout() {
  return (
    <div className="min-h-screen bg-surface">
      <TopAppBar />
      <main className="flex flex-col lg:flex-row min-h-screen pt-16">
        <SideProgressPanel />
        <section className="flex-1 lg:ml-wizard-panel-width flex flex-col justify-between">
          <div className="w-full h-full flex justify-center px-4 lg:px-margin-desktop py-12">
            <Outlet />
          </div>
          <GlobalFooter />
        </section>
      </main>
    </div>
  );
}
