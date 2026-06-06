import { useNavigate } from "react-router-dom";

export function PaymentFee() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-[800px] flex gap-12">
      {/* Left Context Panel (Visible on Desktop) */}
      <div className="hidden lg:flex flex-col w-1/3 pt-12 space-y-6">
        <div className="inline-block px-3 py-1 bg-surface-container-high rounded-full border border-border-low">
          <span className="text-label-caps font-bold tracking-widest text-on-surface-variant">STEP 02 — PAYMENT</span>
        </div>
        <h2 className="text-headline-md font-headline-md text-primary">Onboarding Fee</h2>
        <p className="text-body-md text-on-surface-variant">Activate your listing on the global maritime marketplace.</p>
        
        <div className="mt-12 border-l-2 border-primary-container pl-6 py-2">
          <h4 className="text-label-caps font-bold tracking-widest text-on-surface mb-2">WHY THIS FEE?</h4>
          <p className="text-body-sm text-on-surface-variant leading-relaxed">
            This annual fee covers verification processing, prioritized job board access, and advanced fleet analytics.
          </p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 space-y-8">
        <header className="lg:hidden mb-8">
          <h2 className="text-headline-lg font-headline-lg text-primary mb-2">Onboarding Fee</h2>
        </header>

        <div className="bg-surface-container rounded-xl border border-border-low p-8 relative overflow-hidden">
          {/* Watermark Icon */}
          <span className="material-symbols-outlined absolute top-6 right-6 text-6xl text-surface-container-highest/50 rotate-12">verified</span>
          
          <p className="text-body-sm text-on-surface-variant mb-2">Verified Provider — Annual</p>
          <div className="flex items-end gap-2 mb-8">
            <h1 className="text-headline-xl font-headline-xl text-primary leading-none">₹15,000</h1>
            <span className="text-label-caps text-on-surface-variant pb-1">/ YEAR</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-container text-[18px]">check_circle</span>
              <span className="text-body-sm text-on-surface-variant">Verified badge</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-container text-[18px]">check_circle</span>
              <span className="text-body-sm text-on-surface-variant">Job board access</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-container text-[18px]">check_circle</span>
              <span className="text-body-sm text-on-surface-variant">Priority listing</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-container text-[18px]">check_circle</span>
              <span className="text-body-sm text-on-surface-variant">Analytics dashboard</span>
            </div>
          </div>
        </div>

        <div className="space-y-6 pt-4">
          <h3 className="text-label-sm font-bold text-on-surface">Payment Details</h3>
          
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">CARD NUMBER</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-3 text-on-surface-variant">credit_card</span>
                <input 
                  type="text" 
                  placeholder="0000 0000 0000 0000" 
                  className="w-full bg-surface-elevated border border-border-low rounded-lg p-3 pl-12 text-label-caps tracking-widest focus:border-primary-container transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-label-caps text-on-surface-variant">EXPIRY DATE</label>
                <input 
                  type="text" 
                  placeholder="MM/YY" 
                  className="bg-surface-elevated border border-border-low rounded-lg p-3 text-label-caps tracking-widest focus:border-primary-container transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-label-caps text-on-surface-variant">CVV</label>
                <input 
                  type="password" 
                  placeholder="***" 
                  className="bg-surface-elevated border border-border-low rounded-lg p-3 text-label-caps tracking-widest focus:border-primary-container transition-all"
                />
              </div>
            </div>
          </div>

          <button 
            onClick={() => navigate('/onboarding/registration')}
            className="w-full bg-primary-container text-on-primary-container font-headline-sm px-6 py-4 rounded-lg shadow-lg hover:shadow-primary-container/30 active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            Pay & Continue
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </button>
          
          <div className="flex items-center justify-center gap-2 pt-2 text-on-surface-variant/60">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            <span className="text-[10px] uppercase tracking-widest">Secure encrypted payment</span>
          </div>
        </div>
      </div>
    </div>
  );
}
