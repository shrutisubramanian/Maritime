import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { quotesService } from "../../../services/quotes";
import { requestsService } from "../../../services/requests";
import { documentsService } from "../../../services/documents";
import { ExtractedDataGrid } from "../../../components/ExtractedDataGrid";
import { ProviderSidebar } from "../../../components/ProviderSidebar";

const C={bg:'var(--color-background)',bgCard:'var(--color-surface)',bgLow:'var(--color-surface-alt)',bgLowest:'var(--color-surface-alt)',bgHigh:'var(--color-surface-deep)',bgHighest:'var(--color-surface-alt)',border:'var(--color-border)',borderV:'var(--color-border-strong)',text:'var(--color-text)',muted:'var(--color-muted)',dim:'var(--color-faint)',slate:'var(--color-muted)',cyan:'var(--color-brand)',primary:'var(--color-brand)',secondary:'var(--color-muted)',error:'var(--color-error)',white:'var(--color-text)'};
const M="Manrope,sans-serif",I="Inter,sans-serif";
const glass:React.CSSProperties={background:C.bgCard,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:`1px solid ${C.border}`};
const lbl:React.CSSProperties={fontFamily:I,fontSize:"0.65rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",color:C.muted,display:"block",marginBottom:"0.5rem"};
const inp:React.CSSProperties={width:"100%",background:C.bgLowest,border:"none",borderBottom:"2px solid rgba(0,0,0,0.4)",padding:"0.75rem 0",color:C.text,fontFamily:I,fontSize:"0.9rem",outline:"none",transition:"border-color 0.2s",boxSizing:"border-box"};
const onF=(e:React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>(e.currentTarget.style.borderBottomColor=C.cyan);
const onB=(e:React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>(e.currentTarget.style.borderBottomColor="rgba(0,0,0,0.4)");

// Request context as returned by GET /requests/{request_id}. Only real fields
// are rendered; anything the API does not provide is omitted, never invented.
interface RequestContext {
  title?: string;
  service_type?: string;
  port?: string;
  urgency?: string;
  vessel_name?: string | null;
  vessel_type?: string | null;
  description?: string | null;
}

export const SubmitQuotation:React.FC=()=>{
  const navigate=useNavigate();
  // Quotation identity (quotation_reference is an optional provider-supplied label)
  const [quotationReference, setQuotationReference] = useState("");
  const [validityDate, setValidityDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [pricingModel, setPricingModel] = useState("Fixed Fee (Turnkey)");
  // Financial structure — every value below is sent in the payload
  const [basePrice, setBasePrice] = useState("");
  const [emergencySurcharge, setEmergencySurcharge] = useState("");
  const [travelCharges, setTravelCharges] = useState("");
  const [taxOn, setTaxOn] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState("Net 30 Days");
  const [warrantyPeriod, setWarrantyPeriod] = useState("12 Months Standard");
  // Timeline
  const [etaStart, setEtaStart] = useState("");
  const [etaEnd, setEtaEnd] = useState("");
  const [commitment, setCommitment] = useState("");
  // Proposal
  const [proposal, setProposal] = useState("");
  // Attachments (uploaded as real documents, ids sent with the quote)
  const [uploadedDocIds, setUploadedDocIds] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extractedFields, setExtractedFields] = useState<Record<string, any> | null>(null);
  // Real request context
  const [requestCtx, setRequestCtx] = useState<RequestContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const requestId = queryParams.get("requestId");

  useEffect(() => {
    if (!requestId) { setCtxError("No request selected — open this page from a request's Submit Quotation action."); return; }
    setCtxLoading(true);
    setCtxError(null);
    requestsService.getRequestById(requestId).then((r: any) => {
      setRequestCtx({
        title: r.title,
        service_type: r.service_type,
        port: r.port,
        urgency: r.urgency,
        vessel_name: r.vessel_name ?? null,
        vessel_type: r.vessel_type ?? null,
        description: r.description ?? null,
      });
    }).catch(() => setCtxError("Could not load the request details.")).finally(() => setCtxLoading(false));
  }, [requestId]);

  // Grand total computed from the actual inputs — no hardcoded total.
  const grandTotal = (() => {
    const base = parseFloat(basePrice) || 0;
    const surcharge = parseFloat(emergencySurcharge) || 0;
    const travel = parseFloat(travelCharges) || 0;
    const subtotal = base + surcharge + travel;
    return taxOn ? subtotal * 1.07 : subtotal;
  })();

  const handleSubmit = async () => {
    if (!requestId) {
      alert("Missing Request ID in URL");
      return;
    }
    setSubmitting(true);
    try {
      const quoteData = {
        amount: parseFloat(basePrice),
        currency,
        quotation_reference: quotationReference || undefined,
        pricing_model: pricingModel,
        travel_charges: parseFloat(travelCharges) || 0,
        emergency_charges: parseFloat(emergencySurcharge) || 0,
        taxes_included: taxOn,
        scope_of_work: proposal || undefined,
        message: proposal || undefined,
        estimated_duration: commitment || undefined,
        estimated_start_date: etaStart ? new Date(etaStart).toISOString() : undefined,
        estimated_completion_date: etaEnd ? new Date(etaEnd).toISOString() : undefined,
        warranty_period: warrantyPeriod || undefined,
        payment_terms: paymentTerms || undefined,
        validity_date: validityDate ? new Date(validityDate).toISOString() : undefined,
        attachments: uploadedDocIds.length > 0 ? uploadedDocIds : undefined,
      };
      await quotesService.createQuote(requestId, quoteData);
      navigate('/success', { state: { type: 'quote_submitted' } });
    } catch (err) {
      console.error(err);
      alert("Failed to submit quotation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    try {
      const ids: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const response = await documentsService.uploadDocument(files[i], { document_type: "quotation" });
        if (response.document && response.document.id) {
          ids.push(response.document.id);
        }
        if (response.fields) {
          setExtractedFields(response.fields);
        }
      }
      setUploadedDocIds(prev => [...prev, ...ids]);
    } catch (err) {
      console.error(err);
      setUploadError("Failed to upload one or more documents.");
    }
  };

  return(
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:"100vh",overflowX:"hidden"}}>
      {/* SIDE NAV */}
      <ProviderSidebar activePath="/submit-quotation" />

      {/* MAIN */}
      <main style={{marginLeft:'var(--sidebar-width, 256px)',padding:"80px 2.5rem 8rem 2.5rem",minHeight:"100vh",transition:"margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)"}}>
        <header style={{marginBottom:"2.5rem"}}>
          <p style={{fontFamily:I,fontSize:"0.75rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",color:C.muted,margin:"0 0 4px"}}>Response Phase</p>
          <h1 style={{fontFamily:M,fontWeight:800,fontSize:"clamp(1.75rem,3vw,2.25rem)",letterSpacing:"-0.02em",color:C.white,margin:0}}>Submit Quotation</h1>
        </header>
        <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:"2.5rem",alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:"2rem"}}>
            {/* S1 Quotation Identity */}
            <section style={{...glass,borderRadius:16,padding:"2rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.5rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>inventory_2</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Quotation Identity</h2></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem"}}>
                <div><label style={lbl}>Quote Reference (optional)</label><input type="text" placeholder="Your own reference for this quote" value={quotationReference} onChange={e=>setQuotationReference(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                <div><label style={lbl}>Valid Until</label><input type="date" value={validityDate} onChange={e=>setValidityDate(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                <div><label style={lbl}>Currency</label><select value={currency} onChange={e=>setCurrency(e.target.value)} style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option value="USD">USD - United States Dollar</option><option value="EUR">EUR - Euro</option><option value="SGD">SGD - Singapore Dollar</option></select></div>
                <div><label style={lbl}>Pricing Model</label><select value={pricingModel} onChange={e=>setPricingModel(e.target.value)} style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option>Fixed Fee (Turnkey)</option><option>Time &amp; Materials</option><option>Unit Rate (Per Vessel)</option></select></div>
              </div>
            </section>
            {/* S2 Financial Structure */}
            <section style={{...glass,borderRadius:16,padding:"2rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.5rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>payments</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Financial Structure</h2></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem",marginBottom:"1.5rem"}}>
                <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
                  <div><label style={lbl}>Base Quoted Price</label><div style={{position:"relative"}}><span style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",color:C.slate,fontSize:"1rem"}}>$</span><input type="number" placeholder="0.00" value={basePrice} onChange={e=>setBasePrice(e.target.value)} style={{...inp,paddingLeft:"1.25rem",fontFamily:M,fontSize:"1.1rem"}} onFocus={onF} onBlur={onB}/></div></div>
                  <div><label style={lbl}>Emergency/Weekend Surcharge</label><input type="number" placeholder="0.00" value={emergencySurcharge} onChange={e=>setEmergencySurcharge(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                  <div><label style={lbl}>Travel Charges</label><input type="number" placeholder="0.00" value={travelCharges} onChange={e=>setTravelCharges(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"1rem 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={lbl}>Prices Include Tax (7%)</span>
                    <button onClick={()=>setTaxOn(!taxOn)} style={{width:48,height:24,borderRadius:999,background:taxOn?"#4C9DB0":"rgba(0,0,0,0.4)",position:"relative",border:"none",cursor:"pointer",flexShrink:0,transition:"background 0.3s"}}>
                      <div style={{position:"absolute",top:2,left:taxOn?26:2,width:20,height:20,background:C.white,borderRadius:"50%",transition:"left 0.3s"}}/>
                    </button>
                  </div>
                  <div><label style={lbl}>Payment Terms</label><select value={paymentTerms} onChange={e=>setPaymentTerms(e.target.value)} style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option>Net 30 Days</option><option>Net 15 Days</option><option>Pre-paid 100%</option></select></div>
                  <div><label style={lbl}>Warranty Period</label><select value={warrantyPeriod} onChange={e=>setWarrantyPeriod(e.target.value)} style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option>12 Months Standard</option><option>24 Months Extended</option><option>None</option></select></div>
                </div>
              </div>
              <div style={{background:C.bgLow,padding:"1.5rem",borderRadius:12,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><p style={{fontFamily:I,fontSize:"0.65rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",color:C.primary,margin:"0 0 4px"}}>Estimated Grand Total</p><p style={{fontSize:"0.6rem",color:C.slate,textTransform:"uppercase",margin:0}}>Base + surcharge + travel{taxOn ? " + 7% tax" : ""}</p></div>
                <div style={{textAlign:"right"}}>
                  <p style={{fontFamily:M,fontWeight:800,fontSize:"2rem",color:C.cyan,margin:0}}>${grandTotal.toFixed(2)}</p>
                  <p style={{fontSize:"0.6rem",color:C.slate,textTransform:"uppercase",letterSpacing:"0.1em",margin:0}}>{currency}</p>
                </div>
              </div>
            </section>
            {/* S3 Timeline */}
            <section style={{...glass,borderRadius:16,padding:"2rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.5rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>calendar_today</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Execution Timeline</h2></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"1.5rem"}}>
                <div><label style={lbl}>Estimated Start</label><input type="date" value={etaStart} onChange={e=>setEtaStart(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                <div><label style={lbl}>Est. Completion</label><input type="date" value={etaEnd} onChange={e=>setEtaEnd(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                <div><label style={lbl}>Response Commitment</label><select value={commitment} onChange={e=>setCommitment(e.target.value)} style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option value="">Select…</option><option>4-6 Hours</option><option>12 Hours</option><option>24 Hours</option></select></div>
              </div>
            </section>
            {/* S4 Technical Proposal */}
            <section style={{...glass,borderRadius:16,padding:"2rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.5rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>engineering</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Technical Proposal &amp; Scope</h2></div>
              <textarea rows={8} value={proposal} onChange={e=>setProposal(e.target.value)} placeholder="Outline the repair methodology, safety protocols, and equipment list..." style={{width:"100%",background:C.bgLowest,border:"1px solid rgba(0,0,0,0.3)",borderRadius:12,padding:"1rem",fontSize:"0.875rem",color:"#1a1a2e",fontFamily:I,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
            </section>
            {/* S5 Attachments — real document upload, ids sent as quote attachments */}
            <section style={{...glass,borderRadius:16,padding:"2rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:"0.75rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>attach_file</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Attachments</h2></div>
                <span style={{fontSize:"0.75rem",color:C.muted}}>{uploadedDocIds.length} file{uploadedDocIds.length === 1 ? "" : "s"} attached</span>
              </div>
              <label style={{border:"2px dashed rgba(0,0,0,0.3)",borderRadius:12,padding:"2rem",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",cursor:"pointer",transition:"border-color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(76,157,176,0.5)")} onMouseLeave={e=>(e.currentTarget.style.borderColor="rgba(0,0,0,0.3)")} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFileUpload(e.dataTransfer.files)}}>
                <input type="file" multiple style={{display:"none"}} onChange={e=>handleFileUpload(e.target.files)} />
                <span className="material-symbols-outlined" style={{fontSize:"2.5rem",color:C.slate,marginBottom:"0.5rem"}}>cloud_upload</span>
                <p style={{fontFamily:M,fontWeight:700,color:C.white,margin:0,fontSize:"1rem"}}>Drag &amp; drop supporting documents, or click to browse</p>
                <p style={{fontSize:"0.75rem",color:C.slate,margin:"0.5rem 0 0",lineHeight:1.5}}>PDF, DOCX, JPG, PNG, TIFF (Max 25MB per file) — stored as Quotation documents on your account</p>
              </label>
              {uploadError && <p style={{fontSize:"0.8rem",color:C.error,margin:"0.75rem 0 0"}}>{uploadError}</p>}
              {extractedFields && (
                <ExtractedDataGrid
                  fields={extractedFields}
                  onConfirm={() => setExtractedFields(null)}
                />
              )}
            </section>
          </div>

          {/* RIGHT SIDEBAR — real request context from GET /requests/{request_id} */}
          <aside style={{position:"sticky",top:96,display:"flex",flexDirection:"column",gap:"1.5rem"}}>
            <div style={{...glass,borderRadius:16,padding:"1.5rem",borderLeft:`4px solid ${C.cyan}`}}>
              <h3 style={{fontFamily:M,fontWeight:800,fontSize:"1.1rem",color:C.white,margin:"0 0 1rem"}}>Request Details</h3>
              {ctxLoading ? (
                <p style={{fontSize:"0.85rem",color:C.muted,margin:0}}>Loading request…</p>
              ) : ctxError ? (
                <p style={{fontSize:"0.85rem",color:C.error,margin:0}}>{ctxError}</p>
              ) : requestCtx ? (
                <div style={{display:"flex",flexDirection:"column",gap:"0.75rem",fontSize:"0.875rem"}}>
                  <div><span style={lbl}>Title</span><span style={{color:C.white,fontWeight:600}}>{requestCtx.title || requestCtx.service_type || 'Service Request'}</span></div>
                  {requestCtx.port && <div><span style={lbl}>Port</span><span style={{color:C.white,fontWeight:500}}>{requestCtx.port}</span></div>}
                  {requestCtx.urgency && <div><span style={lbl}>Urgency</span><span style={{color:requestCtx.urgency === 'urgent' ? C.error : C.white,fontWeight:500,textTransform:"capitalize"}}>{requestCtx.urgency}</span></div>}
                  {requestCtx.vessel_name && <div><span style={lbl}>Vessel</span><span style={{color:C.white,fontWeight:500}}>{requestCtx.vessel_name}{requestCtx.vessel_type ? ` (${requestCtx.vessel_type})` : ''}</span></div>}
                  {requestCtx.description && <div><span style={lbl}>Description</span><p style={{color:C.muted,margin:"0.25rem 0 0",lineHeight:1.5,fontSize:"0.8rem"}}>{requestCtx.description}</p></div>}
                </div>
              ) : null}
            </div>
            <div style={{...glass,borderRadius:16,padding:"1.5rem"}}>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:"0.95rem",color:C.text,margin:"0 0 0.5rem"}}>Before you submit</h3>
              <p style={{fontSize:"0.8rem",color:C.muted,margin:0,lineHeight:1.6}}>
                Your quotation is sent directly to the client, who compares all received quotations and
                accepts one. Amounts, terms, and scope are shown to the client exactly as entered here.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* BOTTOM BAR */}
      <div style={{position:"fixed",bottom:0,left:288,right:0,...glass,borderTop:`1px solid ${C.border}`,zIndex:50,padding:"1.25rem 2.5rem"}}>
        <div style={{maxWidth:1400,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"1rem"}}>
          <div style={{fontSize:"0.85rem",color:C.muted}}>
            Estimated total: <strong style={{color:C.cyan}}>${grandTotal.toFixed(2)} {currency}</strong>
            {uploadedDocIds.length > 0 && <> • {uploadedDocIds.length} attachment{uploadedDocIds.length === 1 ? "" : "s"}</>}
          </div>
          <button onClick={handleSubmit} disabled={submitting || !requestId || !basePrice} style={{padding:"0.75rem 2.5rem",borderRadius:8,background:"linear-gradient(to right,#4C9DB0,#2563eb)",color:C.white,fontWeight:700,fontSize:"0.875rem",border:"none",cursor:submitting?"not-allowed":"pointer",opacity:submitting?0.7:1,boxShadow:"0 10px 20px rgba(76,157,176,0.2)",transition:"all 0.2s"}}>{submitting ? "Submitting..." : "Submit Quotation"}</button>
        </div>
      </div>
    </div>
  );
};
export default SubmitQuotation;
