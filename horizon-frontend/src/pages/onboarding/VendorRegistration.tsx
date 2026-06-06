import { useNavigate } from "react-router-dom";

export function VendorRegistration() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-3xl">
      <div className="lg:hidden mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-headline-md font-headline-md text-primary-container">Vendor Registration</h1>
          <span className="text-label-caps text-on-surface-variant">Step 3 of 5</span>
        </div>
        <div className="w-full h-1 bg-border-low rounded-full overflow-hidden">
          <div className="w-3/5 h-full bg-primary-container step-glow"></div>
        </div>
      </div>

      <form className="space-y-form-group-gap" onSubmit={(e) => { e.preventDefault(); navigate('/onboarding/kyc'); }}>
        {/* Section A: Business Identity */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-border-low pb-2">
            <span className="text-label-caps font-bold text-primary-container">01</span>
            <h2 className="text-headline-sm font-headline-sm uppercase tracking-wider">Business Identity</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">Company Name</label>
              <input className="bg-surface-elevated border border-border-low rounded-lg p-3 text-body-md focus:border-primary-container transition-all" placeholder="Legal Entity Name" type="text" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">Legal Structure</label>
              <select className="bg-surface-elevated border border-border-low rounded-lg p-3 text-body-md focus:border-primary-container transition-all appearance-none">
                <option>Private Limited</option>
                <option>Partnership</option>
                <option>Sole Proprietorship</option>
                <option>Public Limited</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">Incorporation Date</label>
              <input className="bg-surface-elevated border border-border-low rounded-lg p-3 text-body-md focus:border-primary-container transition-all" type="date" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">Nationality</label>
              <input className="bg-surface-elevated border border-border-low rounded-lg p-3 text-body-md focus:border-primary-container transition-all" placeholder="Country of Registration" type="text" />
            </div>
          </div>
        </div>

        {/* Section B: Tax Details */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-border-low pb-2">
            <span className="text-label-caps font-bold text-primary-container">02</span>
            <h2 className="text-headline-sm font-headline-sm uppercase tracking-wider">Tax Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">PAN Number</label>
              <input className="bg-surface-elevated border border-border-low rounded-lg p-3 text-label-caps focus:border-primary-container transition-all uppercase" placeholder="ABCDE1234F" type="text" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">GST Number</label>
              <input className="bg-surface-elevated border border-border-low rounded-lg p-3 text-label-caps focus:border-primary-container transition-all uppercase" placeholder="22AAAAA0000A1Z5" type="text" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">TAN Number</label>
              <input className="bg-surface-elevated border border-border-low rounded-lg p-3 text-label-caps focus:border-primary-container transition-all uppercase" placeholder="ABCD12345E" type="text" />
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl border border-border-low">
            <div className="flex flex-col">
              <span className="text-body-md font-bold text-on-surface">MSME Registered</span>
              <span className="text-label-sm text-on-surface-variant">Is your business registered as an MSME/SME?</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input className="sr-only peer" type="checkbox" />
              <div className="w-11 h-6 bg-border-low peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container"></div>
            </label>
          </div>
        </div>

        {/* Section C: Financial Info */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-border-low pb-2">
            <span className="text-label-caps font-bold text-primary-container">03</span>
            <h2 className="text-headline-sm font-headline-sm uppercase tracking-wider">Financial Performance</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">Turnover (FY 23-24)</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-on-surface-variant text-sm">$</span>
                <input className="w-full bg-surface-elevated border border-border-low rounded-lg p-3 pl-8 text-body-md focus:border-primary-container transition-all" type="number" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">Turnover (FY 22-23)</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-on-surface-variant text-sm">$</span>
                <input className="w-full bg-surface-elevated border border-border-low rounded-lg p-3 pl-8 text-body-md focus:border-primary-container transition-all" type="number" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">Turnover (FY 21-22)</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-on-surface-variant text-sm">$</span>
                <input className="w-full bg-surface-elevated border border-border-low rounded-lg p-3 pl-8 text-body-md focus:border-primary-container transition-all" type="number" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <label className="text-label-caps text-on-surface-variant">Latest Audit Report</label>
            <div className="group relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border-low rounded-xl bg-surface-elevated hover:border-primary-container/50 transition-all cursor-pointer overflow-hidden">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-2 group-hover:text-primary-container/60 transition-colors">cloud_upload</span>
                <p className="text-body-sm text-on-surface-variant">Drop PDF file here or <span className="text-primary-container underline">browse</span></p>
                <p className="text-[10px] text-on-surface-variant/60 uppercase tracking-widest mt-1">Max size: 10MB</p>
              </div>
              <input className="hidden" type="file" />
            </div>
          </div>
        </div>

        {/* Section D: Banking */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-border-low pb-2">
            <span className="text-label-caps font-bold text-primary-container">04</span>
            <h2 className="text-headline-sm font-headline-sm uppercase tracking-wider">Banking Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">Bank Name</label>
              <input className="bg-surface-elevated border border-border-low rounded-lg p-3 text-body-md focus:border-primary-container transition-all" type="text" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">IFSC / SWIFT Code</label>
              <input className="bg-surface-elevated border border-border-low rounded-lg p-3 text-label-caps focus:border-primary-container transition-all uppercase" type="text" />
            </div>
            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-label-caps text-on-surface-variant">Account Number</label>
              <input className="bg-surface-elevated border border-border-low rounded-lg p-3 text-body-md focus:border-primary-container transition-all font-label-sm" type="password" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <label className="text-label-caps text-on-surface-variant">Cancelled Cheque / Bank Statement</label>
            <div className="group relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border-low rounded-xl bg-surface-elevated hover:border-tertiary/50 transition-all cursor-pointer">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-2 group-hover:text-tertiary/60 transition-colors">description</span>
              <p className="text-body-sm text-on-surface-variant">Upload Verification Document</p>
              <input className="hidden" type="file" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-10 flex items-center justify-between border-t border-border-low">
          <button className="px-8 py-3 rounded-lg border border-border-low text-on-surface-variant hover:bg-surface-container-high transition-all flex items-center gap-2" type="button" onClick={() => navigate('/onboarding/fee')}>
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </button>
          <button className="bg-primary-container text-on-primary-container px-10 py-4 rounded-lg font-bold text-body-md shadow-lg shadow-primary-container/20 hover:scale-[1.02] active:scale-95 transition-all" type="submit">
            Save & Continue
          </button>
        </div>
      </form>
    </div>
  );
}
