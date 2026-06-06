import { useNavigate } from "react-router-dom";

export function MaritimeCredentials() {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-[800px] space-y-form-group-gap">
      <header className="lg:hidden mb-8">
        <h2 className="text-headline-lg font-headline-lg text-primary mb-2">Maritime Credentials</h2>
        <div className="h-1 w-full bg-border-low rounded-full">
          <div className="h-1 w-1/5 bg-primary rounded-full shadow-[0_0_10px_rgba(0,102,255,0.4)]"></div>
        </div>
      </header>

      <div className="grid gap-8">
        {/* CDC Card (Verified) */}
        <div className="group bg-surface-container rounded-xl border border-border-low p-6 transition-all hover:border-primary/30">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-headline-sm">Continuous Discharge Certificate (CDC)</h3>
                <span className="text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant border border-border-low">Required</span>
              </div>
              <p className="text-label-sm text-on-surface-variant">Proof of official seagoing service and rank.</p>
            </div>
            <div className="flex items-center gap-2 text-verification-success bg-verification-success/10 px-3 py-1 rounded-full">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              <span className="text-label-caps font-bold">Verified</span>
            </div>
          </div>
          <div className="relative bg-surface-container-low border-2 border-dashed border-border-low rounded-lg p-8 flex flex-col items-center justify-center text-center transition-all group-hover:bg-surface-container-highest/20">
            <span className="material-symbols-outlined text-4xl text-verification-success mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>task</span>
            <p className="text-body-md text-on-surface font-semibold">cdc_document_v2.pdf</p>
            <p className="text-label-sm text-on-surface-variant">Uploaded on Oct 12, 2023</p>
            <div className="mt-4 flex gap-3">
              <button className="text-label-caps font-bold text-primary hover:underline">Replace File</button>
              <button className="text-label-caps font-bold text-error hover:underline">Remove</button>
            </div>
          </div>
        </div>

        {/* CoC Card (Under Review) */}
        <div className="group bg-surface-container rounded-xl border border-border-low p-6 transition-all hover:border-primary/30">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-headline-sm">Certificate of Competency (CoC)</h3>
                <span className="text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant border border-border-low">Required</span>
              </div>
              <p className="text-label-sm text-on-surface-variant">Officer rank qualification according to STCW guidelines.</p>
            </div>
            <div className="flex items-center gap-2 text-verification-pending bg-verification-pending/10 px-3 py-1 rounded-full">
              <span className="material-symbols-outlined text-[18px]">history</span>
              <span className="text-label-caps font-bold">Under Review</span>
            </div>
          </div>
          <div className="bg-surface-container-low border-2 border-solid border-primary-container/30 rounded-lg p-8 flex flex-col items-center justify-center text-center shadow-[inset_0_0_20px_rgba(0,102,255,0.03)]">
            <span className="material-symbols-outlined text-4xl text-primary-container mb-2 animate-spin" style={{ animationDuration: '3s' }}>sync</span>
            <p className="text-body-md text-on-surface font-semibold">coc_maritime_lic.pdf</p>
            <div className="w-48 h-1 bg-border-low rounded-full mt-4 overflow-hidden">
              <div className="h-full bg-primary-container w-2/3 animate-pulse"></div>
            </div>
            <p className="text-label-sm text-on-surface-variant mt-2">Scanning document for integrity...</p>
          </div>
        </div>

        {/* STCW Card (Empty) */}
        <div className="group bg-surface-container rounded-xl border border-border-low p-6 transition-all hover:border-primary/30">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-headline-sm">STCW Basic Safety Training</h3>
                <span className="text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant border border-border-low opacity-60">Optional</span>
              </div>
              <p className="text-label-sm text-on-surface-variant">Standard training for Certification and Watchkeeping.</p>
            </div>
            <div className="flex items-center gap-2 text-on-surface-variant/40 bg-surface-container-high px-3 py-1 rounded-full">
              <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
              <span className="text-label-caps font-bold">Empty</span>
            </div>
          </div>
          <label className="cursor-pointer bg-surface-container-low border-2 border-dashed border-border-low rounded-lg p-10 flex flex-col items-center justify-center text-center hover:border-primary/50 hover:bg-primary/5 transition-all">
            <input className="hidden" type="file" />
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4 group-hover:text-primary transition-colors">upload_file</span>
            <p className="text-body-md text-on-surface mb-1">Drag and drop or <span className="text-primary font-bold">browse</span></p>
            <p className="text-label-sm text-on-surface-variant">PDF, JPG, or PNG (Max 10MB)</p>
          </label>
        </div>
      </div>

      <footer className="flex items-center justify-between pt-8 border-t border-border-low">
        <button className="flex items-center gap-2 text-label-caps font-bold text-on-surface-variant hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Dashboard
        </button>
        <button 
          onClick={() => navigate('/onboarding/fee')}
          className="bg-primary-container text-on-primary-container font-headline-sm px-10 py-4 rounded-lg shadow-[0px_4px_16px_rgba(0,102,255,0.3)] hover:shadow-[0px_8px_24px_rgba(0,102,255,0.5)] active:scale-95 transition-all flex items-center gap-3"
        >
          Save & Continue
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </footer>
    </div>
  );
}
