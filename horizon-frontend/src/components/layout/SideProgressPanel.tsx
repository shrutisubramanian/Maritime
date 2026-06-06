import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const steps = [
  { id: 1, label: "Credentials", href: "/onboarding/credentials", icon: "verified" },
  { id: 2, label: "Fee", href: "/onboarding/fee", icon: "payments" },
  { id: 3, label: "Registration", href: "/onboarding/registration", icon: "domain" },
  { id: 4, label: "KYC", href: "/onboarding/kyc", icon: "security" },
  { id: 5, label: "Review", href: "/onboarding/review", icon: "fact_check" },
];

export function SideProgressPanel({ 
  title = "Service Provider Portal",
  subtitle = "Onboarding Wizard",
  imageSrc = "https://lh3.googleusercontent.com/aida-public/AB6AXuCmIaZiSzbbBg37Z4M2rgrfQ-87KgSbcjZNZQojCUSmYtfbJ8pAv8X5VKg7eJxbYdRFnuzn4wvP45Cl3pL0TBM5ymLYwy64FoGdP2TxpJlTLW0pwu2gr0nx0lYJYxxGEr4qHxmhG8R1fS-MqUq1JrLkvNbLumyXoYXC9CmmBbvP3SUCHBTHHxVXDcNWF4jWFZEQIjkPvY0_G5cN2T0SXDnLl-dveZLGhzJ_UiK_idOpmYKIeYEZZoUvXpI1TTr50NUWuwNe35YE9-8u"
}) {
  const location = useLocation();

  return (
    <aside className="hidden lg:flex flex-col h-[calc(100vh-64px)] fixed left-0 top-16 w-wizard-panel-width z-40 bg-surface-dim border-r border-border-low shadow-xl overflow-hidden">
      <div className="relative h-2/5 w-full shrink-0">
        <img 
          alt="Maritime vessel at sea" 
          className="absolute inset-0 w-full h-full object-cover grayscale opacity-40 mix-blend-luminosity hover:scale-105 transition-transform duration-700" 
          src={imageSrc}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-dim via-surface-dim/60 to-transparent"></div>
        <div className="absolute bottom-6 left-8">
          <h1 className="text-headline-xl font-headline-xl text-primary leading-tight">{title}</h1>
        </div>
      </div>

      <div className="p-8 space-y-8 flex-1 overflow-y-auto">
        <div className="space-y-4">
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Stepper Progress */}
        <nav className="space-y-6">
          {steps.map((step) => {
            const isActive = location.pathname.includes(step.href);
            
            // Determine completed state
            const currentIndex = steps.findIndex(s => location.pathname.includes(s.href));
            const stepIndex = steps.indexOf(step);
            const isCompleted = stepIndex < currentIndex;

            if (isActive) {
              return (
                <div key={step.id} className="flex items-center gap-4 group">
                  <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold shadow-[0_0_15px_rgba(0,102,255,0.3)]">
                    {step.id}
                  </div>
                  <span className="text-label-caps font-bold text-primary">{step.label}</span>
                </div>
              );
            }

            if (isCompleted) {
              return (
                <div key={step.id} className="flex items-center gap-4 text-verification-success group opacity-80">
                  <div className="w-8 h-8 rounded-full border-2 border-verification-success flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      check
                    </span>
                  </div>
                  <span className="text-label-caps font-bold">{step.label}</span>
                </div>
              );
            }

            // Future step
            return (
              <div key={step.id} className="flex items-center gap-4 opacity-40">
                <div className="w-8 h-8 rounded-full border-2 border-border-low flex items-center justify-center font-bold">
                  {step.id}
                </div>
                <span className="text-label-caps font-bold">{step.label}</span>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
