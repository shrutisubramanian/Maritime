import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { requestsService } from "../../../services/requests";
import { quotesService } from "../../../services/quotes";
import { providersService } from "../../../services/providers";
import { ClientSidebar } from "../../../components/ClientSidebar";
import { BrandLogo } from "../../../components/BrandLogo";

const C={bg:'var(--color-background)',bgCard:'var(--color-surface)',bgCardH:'var(--color-surface)',bgHigh:'var(--color-surface-deep)',bgBright:'var(--color-surface-deep)',bgLowest:'var(--color-surface-alt)',bgLow:'var(--color-surface-alt)',border:'var(--color-border)',borderV:'var(--color-border-strong)',text:'var(--color-text)',muted:'var(--color-muted)',dim:'var(--color-faint)',cyan:'var(--color-brand)',cyanCont:'var(--color-brand-tint-solid)',primary:'var(--color-brand)',primCont:'var(--color-brand-tint-solid)',secondary:'var(--color-muted)',secCont:'var(--color-surface-alt)',error:'var(--color-error)',white:'var(--color-text)',green:'var(--color-success)',slate:'var(--color-muted)',success:'var(--color-success)',successDim:'var(--color-success-tint)',warning:'var(--color-warning)',warningDim:'var(--color-warning-tint)',danger:'var(--color-error)',dangerDim:'var(--color-error-tint)',info:'var(--color-info)',infoDim:'var(--color-info-tint)'};
const M="Manrope,sans-serif",I="Inter,sans-serif";

// Everything shown comes from the real quotation API. No provider ranking,
// scoring, or "best quote" indicator is computed — the client decides.
interface QuoteRow {
  id: string;
  provider_id: string | null;
  provider_name?: string;
  /** False until the provider accepts the job; identity stays hidden until then. */
  contact_revealed?: boolean;
  provider_label?: string;
  provider_accepted_at?: string | null;
  provider_contact?: { name?: string | null; phone?: string | null } | null;
  amount: number;
  currency: string;
  quotation_reference?: string | null;
  pricing_model?: string | null;
  warranty_period?: string | null;
  payment_terms?: string | null;
  scope_of_work?: string | null;
  status: string;
  created_at: string;
}

export const CompareQuotations:React.FC=()=>{
  const navigate=useNavigate();
  const [searchParams] = useSearchParams();
  const initialRequestId = searchParams.get('requestId') || '';

  const [procurement, setProcurement] = useState<any[]>([]);
  const [procLoading, setProcLoading] = useState(true);
  const [procError, setProcError] = useState<string | null>(null);

  const [selectedRequestId, setSelectedRequestId] = useState(initialRequestId);
  const [requestTitle, setRequestTitle] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    requestsService.getClientRequests().then(res => {
      const mapped = (res.data || []).map((r: any) => ({
        id: r.id,
        name: r.title || r.service_type || 'Service Request',
        port: r.port || '',
        status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
        statusColor: r.status === 'open' ? C.cyan : (r.status === 'completed' ? C.green : C.dim),
      }));
      setProcurement(mapped);
    }).catch(() => setProcError("Could not load your requests.")).finally(() => setProcLoading(false));
  }, []);

  const loadQuotes = (requestId: string) => {
    if (!requestId) return;
    setQuotesLoading(true);
    setQuotesError(null);
    setActionMsg(null);
    const req = procurement.find(r => r.id === requestId);
    setRequestTitle(req ? req.name : null);
    quotesService.getQuotesForRequest(requestId).then(async (res: any[]) => {
      // The quotation API decides whether the provider may be identified.
      // Only a revealed offer is looked up; an anonymous one is never resolved
      // through the public profile API, or the gate would be bypassed.
      const rows: QuoteRow[] = [];
      for (const q of (res || [])) {
        let providerName: string | undefined = q.provider?.company_name || undefined;
        if (!providerName && q.contact_revealed && q.provider_id) {
          try {
            const p = await providersService.getProviderById(q.provider_id);
            if (p && (p.company_name || p.name)) providerName = p.company_name || p.name;
          } catch { /* profile not public — omit name, never invent one */ }
        }
        rows.push({ ...q, provider_name: providerName });
      }
      setQuotes(rows);
    }).catch(() => setQuotesError("Could not load quotations for this request.")).finally(() => setQuotesLoading(false));
  };

  useEffect(() => { if (initialRequestId) loadQuotes(initialRequestId); /* eslint-disable-next-line */ }, []);

  const act = (quoteId: string, action: 'accept' | 'reject') => {
    setActionMsg(null);
    const call = action === 'accept' ? quotesService.acceptQuote(quoteId) : quotesService.rejectQuote(quoteId);
    call.then(() => {
      setActionMsg(action === 'accept' ? 'Quotation accepted.' : 'Quotation rejected.');
      if (selectedRequestId) loadQuotes(selectedRequestId);
    }).catch(() => setActionMsg(`Could not ${action} this quotation.`));
  };

  const money = (q: QuoteRow) => `${q.amount} ${q.currency}`;

  return(
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:"100vh",overflowX:"hidden",paddingBottom:24}}>
      {/* SIDEBAR */}
      <ClientSidebar activePath="/compare-quotations" />

      {/* NAV */}
      <header style={{position:"sticky",top:0,zIndex:50,marginLeft:'var(--sidebar-width, 256px)',background: 'var(--bg-glass)',backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",boxShadow:"0 20px 40px rgba(76,157,176,0.08)",display:"flex",justifyContent:"space-between",alignItems:"center",paddingLeft:'var(--header-padding-left, 4.5rem)',paddingRight:'2rem',paddingTop:'1rem',paddingBottom:'1rem',transition:'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)'}}>
        <div style={{display:"flex",alignItems:"center",gap:"2rem"}}>
          {/* Header is a fixed light glass strip, so brand-blue is used. */}
          <BrandLogo height={26} variant="brand" />
          <nav style={{display:"flex",gap:"1.5rem"}}>
            {[{l:"Fleet Overview",active:false,p:"/ship-owner"},{l:"My Requests",active:true,p:"/compare-quotations"},{l:"My Orders",active:false,p:"/orders"}].map(n=>(
              <a key={n.l} href="#" onClick={e=>{e.preventDefault();navigate(n.p);}} style={{fontFamily:I,fontSize:"0.65rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.1em",color:n.active?C.primary:C.muted,borderBottom:n.active?"2px solid "+C.primary:"none",paddingBottom:n.active?4:0,textDecoration:"none",transition:"color 0.2s"}}>{n.l}</a>
            ))}
          </nav>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
          <div onClick={()=>navigate("/notifications")} style={{position:"relative",cursor:"pointer"}}><span className="material-symbols-outlined" style={{color:C.muted,fontSize:"1.4rem"}}>notifications</span></div>
          <div style={{width:40,height:40,borderRadius:"50%",background:C.bgLow,border:"1px solid rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>navigate("/company-profile")}>
            <span className="material-symbols-outlined" style={{color:C.slate,fontSize:"1.2rem"}}>person</span>
          </div>
        </div>
      </header>

      <main style={{maxWidth:1600,marginLeft:'var(--sidebar-width, 256px)',padding:"3rem 2rem",transition:'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)'}}>
        <div style={{marginBottom:"3rem"}}>
          <h1 style={{fontFamily:M,fontWeight:800,fontSize:"clamp(1.75rem,4vw,2.5rem)",letterSpacing:"-0.04em",color:C.text,margin:"0 0 0.5rem"}}>My Requests & Quotations</h1>
          <p style={{color:C.muted,fontSize:"1rem",maxWidth:600,margin:0,lineHeight:1.6}}>Select one of your requests to see the quotations providers have submitted, and accept or reject each one.</p>
        </div>

        {/* MY REQUESTS — real data, row click loads that request's quotes */}
        <div style={{ background: C.bgLow, borderRadius: 24, overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: "3rem" }}>
          <div style={{ padding: '1.5rem', borderBottom: `1px solid ${C.border}` }}>
            <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1rem', color: C.white, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>My Requests</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.bgLowest, fontSize: '0.6rem', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                  {['Request','Port','Status','Actions'].map((h, i) => (
                    <th key={h} style={{ padding: '1rem 1.5rem', textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {procLoading ? (
                  <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: C.dim }}>Loading your requests...</td></tr>
                ) : procError ? (
                  <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: C.error }}>{procError}</td></tr>
                ) : procurement.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: C.dim }}>No active requests found.</td></tr>
                ) : procurement.map((row, i) => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${C.border}`, background: selectedRequestId === row.id ? C.cyanCont : 'transparent' }}>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: 500, color: C.white }}>{row.name}</td>
                    <td style={{ padding: '1rem 1.5rem', color: C.muted }}>{row.port || '—'}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.statusColor }} />
                        <span style={{ color: row.statusColor, fontSize: '0.75rem' }}>{row.status}</span>
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setSelectedRequestId(row.id); loadQuotes(row.id); }} style={{ padding: '0.35rem 0.9rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.cyan, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                        View Quotes
                      </button>
                      <button onClick={() => navigate(`/request/${row.id}`)} style={{ padding: '0.35rem 0.9rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: '0.75rem', cursor: 'pointer' }}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* QUOTATIONS FOR SELECTED REQUEST — real API data only */}
        {selectedRequestId && (
          <div style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.3rem', color: C.text, margin: 0 }}>
                Quotations{requestTitle ? ` — ${requestTitle}` : ''}
              </h2>
              {actionMsg && <span style={{ fontSize: '0.8rem', color: C.primary, fontWeight: 700 }}>{actionMsg}</span>}
            </div>

            {quotesLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: C.dim }}>Loading quotations...</div>
            ) : quotesError ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: C.error, background: C.bgLow, borderRadius: 16 }}>{quotesError}</div>
            ) : quotes.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', background: C.bgLow, borderRadius: 16, border: `1px dashed ${C.border}` }}>
                <p style={{ color: C.muted, margin: 0 }}>No quotations have been submitted for this request yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {quotes.map(q => (
                  <div key={q.id} style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: M, fontWeight: 800, fontSize: '1.15rem', color: C.primary }}>{money(q)}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: C.bgLow, color: C.muted, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>{q.status}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: C.muted, marginTop: 4 }}>
                          {q.contact_revealed
                            ? `Provider: ${q.provider_name || 'Provider'}${q.provider_contact?.phone ? ` • ${q.provider_contact.phone}` : ''}`
                            : `Anonymous offer — name and number shared once both sides accept`}
                          {q.quotation_reference ? ` • Ref: ${q.quotation_reference}` : ''}
                          {q.pricing_model ? ` • ${q.pricing_model}` : ''}
                        </div>
                      </div>
                      {q.status.toLowerCase() === 'pending' ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => act(q.id, 'accept')} style={{ padding: '0.45rem 1.1rem', borderRadius: 8, background: C.success, color: 'var(--color-text-inverse)', fontWeight: 700, fontSize: '0.8rem', border: 'none', cursor: 'pointer' }}>Accept</button>
                          <button onClick={() => act(q.id, 'reject')} style={{ padding: '0.45rem 1.1rem', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.error, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Reject</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: C.dim }}>Reviewed — no further action possible</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.8rem', color: C.muted }}>
                      {q.warranty_period && <div><strong style={{ color: C.text }}>Warranty:</strong> {q.warranty_period}</div>}
                      {q.payment_terms && <div><strong style={{ color: C.text }}>Payment:</strong> {q.payment_terms}</div>}
                      {q.scope_of_work && <div style={{ gridColumn: '1 / -1', lineHeight: 1.5 }}><strong style={{ color: C.text }}>Scope:</strong> {q.scope_of_work}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HOW AWARDING WORKS — honest guidance, no scoring */}
        <div style={{ background: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, padding: '1.5rem', maxWidth: 800 }}>
          <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1rem', color: C.text, margin: '0 0 0.5rem' }}>About awarding</h3>
          <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0, lineHeight: 1.6 }}>
            Nhaav does not rank or score quotations. Compare the amounts, terms, and scope yourself and
            accept the single quotation that fits your needs — accepting one marks it as the awarded quote for that request.
          </p>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <button onClick={() => navigate(-1)} style={{ padding: '0.75rem 1.5rem', borderRadius: 8, border: `1px solid rgba(0,0,0,0.15)`, background: 'transparent', color: C.muted, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>arrow_back</span>Back to Quotations
          </button>
        </div>
      </main>
    </div>
  );
};
export default CompareQuotations;
