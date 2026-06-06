import { useNavigate } from "react-router-dom";

export function KycCompliance() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-3xl space-y-form-group-gap">
      <header className="mb-8">
        <h1 className="text-headline-lg font-headline-lg text-primary mb-2">KYC & Compliance</h1>
        <p className="text-body-md text-on-surface-variant">
          Verifying ownership and regulatory compliance to maintain a sanctions-free marketplace
          and ensure the integrity of global maritime operations.
        </p>
      </header>

      {/* Ownership Details */}
      <div className="bg-surface-container rounded-xl border border-border-low p-8 space-y-6">
        <div className="flex justify-between items-center border-b border-border-low pb-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary-container">group</span>
            <h2 className="text-headline-sm font-headline-sm">Ownership Details</h2>
          </div>
          <button className="text-label-sm text-primary flex items-center gap-1 hover:underline">
            <span className="material-symbols-outlined text-[14px]">add</span> Add Link
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-label-caps text-on-surface-variant">Ultimate Beneficial Owner</label>
            <input 
              type="text" 
              placeholder="Full Legal Name"
              className="bg-surface-elevated border border-border-low rounded-lg p-3 text-body-md focus:border-primary-container transition-all" 
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-label-caps text-on-surface-variant">Percentage Held (%)</label>
            <input 
              type="text" 
              placeholder="25.00"
              className="bg-surface-elevated border border-border-low rounded-lg p-3 text-body-md focus:border-primary-container transition-all" 
            />
          </div>
        </div>
      </div>

      {/* Board of Directors */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant">account_tree</span>
          <h3 className="text-body-md font-bold text-on-surface">Board of Directors</h3>
        </div>
        
        <div className="border border-border-low rounded-lg overflow-hidden bg-surface-container">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-border-low bg-surface-container-high/50 text-label-caps text-on-surface-variant">
            <div className="col-span-5">Full Name</div>
            <div className="col-span-5">Designation</div>
            <div className="col-span-2 text-center">Action</div>
          </div>
          
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-border-low items-center">
            <div className="col-span-5 font-bold text-on-surface">Capt. Erik Vang</div>
            <div className="col-span-5">
              <span className="px-2 py-1 bg-primary-container/10 text-primary rounded border border-primary-container/30 text-label-caps">Executive Director</span>
            </div>
            <div className="col-span-2 text-center">
              <button className="material-symbols-outlined text-on-surface-variant hover:text-error transition-colors">delete</button>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 p-4 items-center bg-surface-elevated/50">
            <div className="col-span-5">
              <input type="text" placeholder="Enter name..." className="w-full bg-transparent border-none focus:ring-0 text-body-md p-0 italic text-on-surface-variant" />
            </div>
            <div className="col-span-5">
              <input type="text" placeholder="Designation..." className="w-full bg-transparent border-none focus:ring-0 text-body-md p-0 italic text-on-surface-variant" />
            </div>
            <div className="col-span-2 text-center">
              <button className="material-symbols-outlined text-primary-container hover:text-primary transition-colors">add</button>
            </div>
          </div>
        </div>
      </div>

      {/* Sanctions Declaration */}
      <div className="bg-surface-container border-l-4 border-primary-container rounded-r-xl p-8 space-y-4">
        <h3 className="text-body-md font-bold text-on-surface">Sanctions Declaration</h3>
        <div className="bg-surface-elevated border border-border-low rounded-lg p-6 flex gap-4">
          <input type="checkbox" className="mt-1 w-5 h-5 bg-surface-container border-border-low rounded text-primary-container focus:ring-primary-container focus:ring-offset-surface-elevated cursor-pointer" />
          <p className="text-body-sm text-on-surface-variant leading-relaxed">
            By checking the box below, the Organization and its authorized representatives formally declare that they are not subject to any sanctions, restrictive measures, or trade embargoes administered by the Office of Foreign Assets Control (OFAC) of the US Department of the Treasury, the United Nations (UN), or the European Union (EU).
          </p>
        </div>
      </div>

      {/* Action Footer */}
      <footer className="pt-8 flex items-center justify-between border-t border-border-low">
        <button 
          onClick={() => navigate('/onboarding/registration')}
          className="px-8 py-3 rounded-lg border border-border-low text-on-surface-variant hover:bg-surface-container-high transition-all flex items-center gap-2"
        >
          Back
        </button>
        <button 
          onClick={() => navigate('/onboarding/review')}
          className="bg-primary-container text-on-primary-container px-10 py-4 rounded-lg font-bold text-body-md shadow-lg shadow-primary-container/20 hover:scale-[1.02] active:scale-95 transition-all"
        >
          Save & Continue
        </button>
      </footer>
    </div>
  );
}
