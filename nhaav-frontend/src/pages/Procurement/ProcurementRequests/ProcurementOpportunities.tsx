import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { requestsService } from "../../../services/requests";
import { quotesService } from "../../../services/quotes";
import { ProviderSidebar } from "../../../components/ProviderSidebar";
import { SupplierSidebar } from "../../../components/SupplierSidebar";
import { useAuth } from "../../../hooks/useAuth";
import { BrandLogo } from "../../../components/BrandLogo";

const C={bg:'var(--color-background)',bgCard:'var(--color-surface)',bgCardH:'var(--color-surface)',bgLow:'var(--color-surface-alt)',bgLowest:'var(--color-surface-alt)',text:'var(--color-text)',muted:'var(--color-muted)',dim:'var(--color-faint)',slate:'var(--color-muted)',cyan:'var(--color-brand)',primary:'var(--color-brand)',secondary:'var(--color-muted)',error:'var(--color-error)',amber:'var(--color-warning)',green:'var(--color-success)',white:'var(--color-text)',border:'var(--color-border)'};
const M="Manrope,sans-serif",I="Inter,sans-serif";
const glass:React.CSSProperties={background:C.bgCard,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:`1px solid ${C.border}`};
const glow:React.CSSProperties={boxShadow:"0 20px 40px rgba(76,157,176,0.08)"};

export const ProcurementOpportunities: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSupplier = user?.role === 'supplier';
  const [opps, setOpps] = useState<any[]>([]);
  const [submittedQuotes, setSubmittedQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [reqRes, quoteRes] = await Promise.all([
          requestsService.getUserRequests({ status: 'open', request_type: isSupplier ? 'supply' : 'service' }),
          quotesService.getMyQuotations()
        ]);
        setOpps(reqRes.data || reqRes || []);
        setSubmittedQuotes(quoteRes || []);
      } catch (err) {
        console.error(err);
        setError("Could not load open requests. Please retry.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isSupplier]);

  const unquotedOpps = opps.filter(o => !submittedQuotes.some(q => q.request_id === o.id));

  // KPI counts derived from the real API responses only — no invented totals.
  const newOpportunities = unquotedOpps.length;
  const quotesSubmitted = submittedQuotes.length;

  return (
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:"100vh",overflowX:"hidden"}}>

      {/* TOP NAV */}
      <nav style={{position:"fixed",top:0,left:"var(--sidebar-width, 256px)",right:0,zIndex:50,height:64,display:"flex",justifyContent:"space-between",alignItems:"center",paddingLeft:"var(--header-padding-left, 4.5rem)",paddingRight:"1.5rem",background: 'var(--bg-glass)',backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",boxShadow:"0 20px 40px rgba(76,157,176,0.08)",transition:"left 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"2rem"}}>
          {/* Nav background is a hardcoded light strip, so brand-blue is used. */}
          <BrandLogo height={24} variant="brand" />
          <div style={{display:"flex",gap:"1.5rem"}}>
            {[{l:"Marketplace",active:true,p:"/procurement-opportunities"},{l:"My Services",p:"/provider/services"},{l:"My Quotations",p:"/my-quotations"}].map(n=>(
              <a key={n.l} href="#" onClick={e=>{e.preventDefault();navigate(n.p);}} style={{color:n.active?C.cyan:"#9a9aa8",fontWeight:n.active?700:500,fontSize:"0.875rem",textDecoration:"none",borderBottom:n.active?("2px solid "+C.cyan):"none",paddingBottom:n.active?4:0}}>{n.l}</a>
            ))}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
          <span onClick={()=>navigate("/notifications")} className="material-symbols-outlined" style={{color:C.muted,cursor:"pointer",fontSize:"1.4rem"}}>notifications</span>
          <div style={{width:32,height:32,borderRadius:"50%",background:C.bgLow,border:"1px solid rgba(76,157,176,0.3)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>navigate("/company-profile")}>
            <span className="material-symbols-outlined" style={{color:C.slate,fontSize:"1.1rem"}}>person</span>
          </div>
        </div>
      </nav>

      {/* SIDE NAV */}
      {isSupplier
        ? <SupplierSidebar activePath="/procurement-opportunities" />
        : <ProviderSidebar activePath="/procurement-opportunities" />}

      {/* MAIN */}
      <main style={{marginLeft:'var(--sidebar-width, 256px)',padding:"80px 2.5rem 5rem 2.5rem",transition:"margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)"}}>
        {/* HEADER */}
        <header style={{marginBottom:"2.5rem",display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:"1.5rem"}}>
          <div>
            <h1 style={{fontFamily:M,fontWeight:800,fontSize:"clamp(1.75rem,3vw,2.5rem)",letterSpacing:"-0.04em",color:C.text,margin:"0 0 0.5rem"}}>Procurement Opportunities</h1>
            <p style={{color:C.muted,fontSize:"1rem",lineHeight:1.6,maxWidth:540,margin:0,fontWeight:300}}>Open requests from maritime clients. Submit a quotation for the ones matching your services.</p>
          </div>
          <div style={{display:"flex",gap:"0.75rem"}}>
            <button onClick={()=>navigate("/my-quotations")} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.6rem 1.25rem",...glass,borderRadius:12,fontSize:"0.8rem",fontWeight:600,color:C.text,border:"none",cursor:"pointer",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgCardH)} onMouseLeave={e=>(e.currentTarget.style.background=C.bgCard)}>
              <span className="material-symbols-outlined" style={{fontSize:"1.1rem"}}>description</span>My Submitted Quotes
            </button>
          </div>
        </header>

        {/* KPI — real counts from the authenticated user's data */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"1rem",marginBottom:"2.5rem",maxWidth:560}}>
          <div style={{...glass,padding:"1.5rem",borderRadius:16,...glow}}>
            <p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em",color:C.muted,margin:"0 0 0.5rem"}}>Open Requests Awaiting Your Quote</p>
            <h3 style={{fontFamily:M,fontWeight:700,fontSize:"2rem",color:C.cyan,margin:0}}>{newOpportunities}</h3>
          </div>
          <div style={{...glass,padding:"1.5rem",borderRadius:16,...glow}}>
            <p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em",color:C.muted,margin:"0 0 0.5rem"}}>My Submitted Quotes</p>
            <h3 style={{fontFamily:M,fontWeight:700,fontSize:"2rem",color:C.text,margin:0}}>{quotesSubmitted}</h3>
          </div>
        </div>

        {/* OPPORTUNITY CARDS */}
        <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: C.cyan }}>Loading opportunities...</div>
          ) : error ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: C.bgLow, borderRadius: 24, border: `1px dashed ${C.border}` }}>
              <p style={{ color: C.error, margin: 0 }}>{error}</p>
            </div>
          ) : unquotedOpps.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: C.bgLow, borderRadius: 24, border: `1px dashed ${C.border}` }}>
              <p style={{ color: C.muted, margin: 0 }}>You have quoted on all available opportunities!</p>
            </div>
          ) : unquotedOpps.map((o,i)=>(
            <div key={o.id || i} style={{...glass,borderRadius:16,padding:"1.5rem",borderLeft:"4px solid "+ (o.urgency === 'urgent' ? C.error : C.cyan),transition:"box-shadow 0.3s",...glow}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"1rem",marginBottom:"1rem",flexWrap:"wrap"}}>
                <div>
                  <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.5rem",flexWrap:"wrap"}}>
                    <span style={{padding:"2px 8px",background: o.urgency === 'urgent' ? 'rgba(248,113,113,0.2)' : 'rgba(76,157,176,0.2)',color: o.urgency === 'urgent' ? C.error : C.cyan,fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",borderRadius:4}}>{o.urgency || "Normal"}</span>
                    <span style={{padding:"2px 8px",background: 'rgba(76,157,176,0.2)',color: C.cyan,fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",borderRadius:4}}>{"Open"}</span>
                  </div>
                  <h2 style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:C.text,margin:0,transition:"color 0.2s"}}>{o.title || o.service_type}</h2>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.5rem",marginBottom:"1rem"}}>
                <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
                  {[{icon:"anchor",l:"Port:",v:o.port},{icon:"directions_boat",l:"Vessel:",v:o.vessel_name}].map(r=>(
                    r.v ? (
                      <div key={r.l} style={{display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.875rem",color:C.muted}}>
                        <span className="material-symbols-outlined" style={{fontSize:"1rem",color:C.cyan}}>{r.icon}</span>{r.l} <span style={{color:C.text,fontWeight:500,marginLeft:4}}>{r.v}</span>
                      </div>
                    ) : null
                  ))}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
                  {[{icon:"schedule",l:"Required By:",v:o.required_completion_date},{icon:"monetization_on",l:"Budget:",v:o.budget != null ? String(o.budget) : null}].map(r=>(
                    r.v ? (
                      <div key={r.l} style={{display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.875rem",color:C.muted}}>
                        <span className="material-symbols-outlined" style={{fontSize:"1rem",color:C.cyan}}>{r.icon}</span>{r.l} <span style={{color:C.text,fontWeight:500,marginLeft:4}}>{r.v}</span>
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
              {o.description && <p style={{fontSize:"0.875rem",color:C.muted,marginBottom:"1rem",lineHeight:1.6}}>{o.description}</p>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:"1rem",borderTop:"1px solid rgba(0,0,0,0.08)"}}>
                <button onClick={()=>navigate(`/request/${o.id}`)} style={{color:C.cyan,fontSize:"0.875rem",fontWeight:700,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}} onMouseEnter={e=>(e.currentTarget.style.textDecoration="underline")} onMouseLeave={e=>(e.currentTarget.style.textDecoration="none")}>
                  View Full Request <span className="material-symbols-outlined" style={{fontSize:"1rem"}}>chevron_right</span>
                </button>
                <button onClick={() => navigate(`/submit-quotation?requestId=${o.id}`)} style={{padding:"0.6rem 1.5rem",background:C.cyan,color:"var(--color-on-brand)",borderRadius:10,fontWeight:700,fontSize:"0.875rem",border:"none",cursor:"pointer",letterSpacing:"0.05em",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background="var(--color-brand-hover)")} onMouseLeave={e=>(e.currentTarget.style.background=C.cyan)}>
                  Submit Quotation
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
export default ProcurementOpportunities;
