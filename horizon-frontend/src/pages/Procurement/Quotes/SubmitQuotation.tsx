import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { quotesService } from "../../../services/quotes";
import { documentsService } from "../../../services/documents";

const C={bg:"#0d141d",bgCard:"rgba(46,53,63,0.4)",bgLow:"#151c26",bgLowest:"#080f18",bgHigh:"#242a34",bgHighest:"#2e353f",border:"rgba(255,255,255,0.05)",borderV:"rgba(68,71,77,0.4)",text:"#dce3f0",muted:"#c4c6ce",dim:"#8e9098",slate:"#64748b",cyan:"#4cd6ff",primary:"#9ccaff",secondary:"#a6c9fa",error:"#ffb4ab",white:"#ffffff"};
const M="Manrope,sans-serif",I="Inter,sans-serif";
const glass:React.CSSProperties={background:C.bgCard,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.05)"};
const lbl:React.CSSProperties={fontFamily:I,fontSize:"0.65rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",color:C.muted,display:"block",marginBottom:"0.5rem"};
const inp:React.CSSProperties={width:"100%",background:C.bgLowest,border:"none",borderBottom:"2px solid rgba(68,71,77,0.4)",padding:"0.75rem 0",color:C.text,fontFamily:I,fontSize:"0.9rem",outline:"none",transition:"border-color 0.2s",boxSizing:"border-box"};
const onF=(e:React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>(e.currentTarget.style.borderBottomColor=C.cyan);
const onB=(e:React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>(e.currentTarget.style.borderBottomColor="rgba(68,71,77,0.4)");
const PROF="https://lh3.googleusercontent.com/aida-public/AB6AXuDR4dF_OoZXs1i1qJv6rHduUf08pwJCA6rb2d5j8BZ3fmi09s4eYQ1LMjd6aoFFrZvm1bK97CyUPewXkHlYaVFsvhI6ElJTKa4qKnPcA3Q3qg7GDub2Gk6rrPJmB3CW9L-wgoKzZWUkUUztVvRJbnRRXw704hnf9piZSLNwgmGUmNtGtjFLGy1HFHJKL1GFZlETxHP1yES1qSBffQeKEYQvePP2ZxIwl9ll9LeRHNge8uMKKgF9C8qD2Sj-G06ZZ2foyrS8XDhNfXcX";
const ENG="https://lh3.googleusercontent.com/aida-public/AB6AXuCxsTGP_7-W40E8wxCA-fLKasxvfFynHfjt4xdyazLcdInmX5l1nM3RcP8liylNwEVOoMpu3elg4EgYW1cfqZT2ijo0ahR4mf0ZQtwInRo1J8Dw3oYCsDWI0Xb7lFPtIbBfnokqAnJzAPnKBU-VwvPiB8YiBf2AQkzxX8YICrgY7ihRUFeslbccC_-NXTZs5pNeRUA9fF7nG50hPLylRkLPisekJS2I4qe_ioQUdQinNdEkxYMLQBT5meIsLNiwbPYEC75qbEPExVlj";
const CERTS=["ISO 9001:2015","DNV-GL Type Approval","IACS Certified"];
export const SubmitQuotation:React.FC=()=>{
  const navigate=useNavigate();
  const [taxOn,setTaxOn]=useState(true);
  const [basePrice, setBasePrice] = useState("14850");
  const [etaStart, setEtaStart] = useState("");
  const [currency, setCurrency] = useState("USD - United States Dollar");
  const [pricingModel, setPricingModel] = useState("Fixed Fee (Turnkey)");
  const [surcharge, setSurcharge] = useState("");
  const [discounts, setDiscounts] = useState("");
  const [etaEnd, setEtaEnd] = useState("");
  const [commitment, setCommitment] = useState("4-6 Hours");
  const [proposal, setProposal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadedDocIds, setUploadedDocIds] = useState<string[]>([]);
  
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const requestId = queryParams.get("requestId");

  const handleSubmit = async () => {
    if (!requestId) {
      alert("Missing Request ID in URL");
      return;
    }
    
    setSubmitting(true);
    try {
      const quoteData = {
        price: parseFloat(basePrice),
        eta: etaStart ? new Date(etaStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' (Est)' : 'TBD',
        details: { currency, pricingModel, basePrice, surcharge, taxOn, discounts, etaStart, etaEnd, commitment, proposal },
        document_ids: uploadedDocIds
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
    try {
      const ids: string[] = [];
      let lastStatus = "";
      for (let i = 0; i < files.length; i++) {
        const response = await documentsService.uploadDocument(files[i], "quotation");
        ids.push(response.document.id);
        lastStatus = response.status || "Document uploaded successfully";
      }
      setUploadedDocIds(prev => [...prev, ...ids]);
      
      // Show notification after file is uploaded
      alert(lastStatus);
    } catch (err) {
      console.error(err);
      alert("Failed to upload document");
    }
  };


  return(
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:"100vh",overflowX:"hidden"}}>
      {/* TOP NAV */}
      <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:50,height:80,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 2rem",background:"rgba(5,11,20,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",boxShadow:"0 20px 40px rgba(0,209,255,0.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"2rem"}}>
          <span style={{fontFamily:M,fontWeight:900,fontSize:"1.4rem",color:C.white,letterSpacing:"-0.04em"}}>HORIZON</span>
          <div style={{display:"flex",gap:"1.5rem"}}>
            {[{l:"Marketplace",p:"/marketplace"},{l:"Vessels",p:"/ship-owner"},{l:"Contracts",p:"/submit-quotation",active:true},{l:"Logistics",p:"/ship-owner"}].map(n=>(
              <a key={n.l} href="#" onClick={e=>{e.preventDefault();navigate(n.p);}} style={{color:n.active?C.cyan:"#94a3b8",fontWeight:500,fontSize:"0.875rem",textDecoration:"none",borderBottom:n.active?"2px solid "+C.cyan:"none",paddingBottom:n.active?4:0,transition:"color 0.2s"}}>{n.l}</a>
            ))}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
          <button style={{background:"rgba(255,255,255,0.05)",padding:"0.5rem",borderRadius:"50%",border:"none",cursor:"pointer",color:C.muted,display:"flex",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.1)")} onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,0.05)")}><span className="material-symbols-outlined">search</span></button>
          <button style={{background:"rgba(255,255,255,0.05)",padding:"0.5rem",borderRadius:"50%",border:"none",cursor:"pointer",color:C.muted,display:"flex",position:"relative",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.1)")} onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,0.05)")}>
            <span className="material-symbols-outlined">notifications</span>
            <span style={{position:"absolute",top:8,right:8,width:8,height:8,background:C.cyan,borderRadius:"50%"}}/>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",paddingLeft:"1.5rem",borderLeft:"1px solid rgba(255,255,255,0.1)"}}>
            <div style={{textAlign:"right"}}>
              <p style={{fontSize:"0.65rem",fontWeight:700,color:C.white,margin:0,textTransform:"uppercase"}}>Chief Engineer</p>
              <p style={{fontSize:"0.6rem",color:C.slate,margin:0}}>Fleet Operations</p>
            </div>
            <img src={PROF} alt="Profile" style={{width:40,height:40,borderRadius:"50%",objectFit:"cover",border:"1px solid rgba(76,214,255,0.3)"}}/>
          </div>
        </div>
      </nav>

      {/* SIDE NAV */}
      <aside style={{position:"fixed",left:0,top:80,bottom:0,width:288,zIndex:40,background:"rgba(5,11,20,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",flexDirection:"column",paddingTop:"1.5rem"}}>
        <div style={{padding:"0 1.5rem",marginBottom:"2rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"1rem",background:"rgba(255,255,255,0.05)",padding:"1rem",borderRadius:12}}>
            <div style={{width:40,height:40,background:"rgba(76,214,255,0.2)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>directions_boat</span></div>
            <div><p style={{fontSize:"0.75rem",fontWeight:700,color:C.white,margin:0}}>MAERSK TIANJIN</p><p style={{fontSize:"0.6rem",color:C.slate,margin:0}}>IMO 9632117</p></div>
          </div>
        </div>
        <nav style={{flex:1,padding:"0 1rem",display:"flex",flexDirection:"column",gap:2}}>
          {[{icon:"directions_boat",l:"Fleet Overview",p:"/ship-owner"},{icon:"hub",l:"Service Hub",p:"/submit-quotation",active:true},{icon:"payments",l:"Financials",p:"/financials"},{icon:"monitoring",l:"Analytics",p:"/analytics"},{icon:"description",l:"Documents",p:"/verification"}].map(item=>(
            <a key={item.l} href="#" onClick={e=>{e.preventDefault();navigate(item.p);}}
              style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.75rem 1rem",borderRadius:8,textDecoration:"none",color:item.active?C.cyan:"#64748b",background:item.active?"rgba(76,214,255,0.1)":"transparent",borderRight:item.active?"2px solid "+C.cyan:"2px solid transparent",fontWeight:item.active?700:400,transition:"all 0.2s"}}
              onMouseEnter={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.05)";(e.currentTarget as HTMLElement).style.color="#e2e8f0";}}}
              onMouseLeave={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background="transparent";(e.currentTarget as HTMLElement).style.color="#64748b";}}}>
              <span className="material-symbols-outlined" style={{fontSize:"1.2rem"}}>{item.icon}</span>
              <span style={{fontSize:"0.7rem",textTransform:"uppercase",letterSpacing:"0.12em"}}>{item.l}</span>
            </a>
          ))}
        </nav>
        <div style={{padding:"1rem 1.5rem"}}>
          <button onClick={()=>navigate("/create-request")} style={{width:"100%",padding:"0.75rem",background:"linear-gradient(to right,#0891b2,#2563eb)",color:C.white,fontWeight:700,fontSize:"0.7rem",textTransform:"uppercase",letterSpacing:"0.15em",border:"none",borderRadius:8,cursor:"pointer",boxShadow:"0 8px 20px rgba(8,145,178,0.2)"}}>New Request</button>
          <div style={{marginTop:"1.5rem",paddingTop:"1.5rem",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {[{icon:"settings",l:"Settings"},{icon:"help",l:"Support"}].map(s=>(
              <a key={s.l} href="#" style={{display:"flex",alignItems:"center",gap:"1rem",padding:"0.5rem 0",color:C.slate,textDecoration:"none",fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.1em",transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.white)} onMouseLeave={e=>(e.currentTarget.style.color=C.slate)}>
                <span className="material-symbols-outlined" style={{fontSize:"1rem"}}>{s.icon}</span>{s.l}
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{marginLeft:288,paddingTop:80,padding:"80px 2.5rem 8rem 2.5rem",minHeight:"100vh"}}>
        <header style={{marginBottom:"2.5rem",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div>
            <p style={{fontFamily:I,fontSize:"0.75rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",color:C.muted,margin:"0 0 4px"}}>Response Phase</p>
            <h1 style={{fontFamily:M,fontWeight:800,fontSize:"clamp(1.75rem,3vw,2.25rem)",letterSpacing:"-0.02em",color:C.white,margin:0}}>Submit Official Quotation</h1>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem",background:"rgba(0,34,44,0.4)",padding:"0.5rem 1rem",borderRadius:999,border:"1px solid rgba(76,214,255,0.2)"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:C.cyan}}/>
            <span style={{fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:C.cyan}}>Drafting Mode Active</span>
          </div>
        </header>
        <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:"2.5rem",alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:"2rem"}}>
            {/* S1 Quotation Identity */}
            <section style={{...glass,borderRadius:16,padding:"2rem",transition:"background 0.3s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(46,53,63,0.6)")} onMouseLeave={e=>(e.currentTarget.style.background=C.bgCard)}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.5rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>inventory_2</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Quotation Identity</h2></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem"}}>
                <div><label style={lbl}>Quote Reference ID</label><input readOnly type="text" defaultValue="HZN-QT-88219" style={{...inp,color:C.cyan,fontWeight:700}} onFocus={onF} onBlur={onB}/></div>
                <div><label style={lbl}>Validity Until</label><input type="date" defaultValue="2024-12-31" style={inp} onFocus={onF} onBlur={onB}/></div>
                <div><label style={lbl}>Currency</label><select value={currency} onChange={e=>setCurrency(e.target.value)} style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option>USD - United States Dollar</option><option>EUR - Euro</option><option>SGD - Singapore Dollar</option></select></div>
                <div><label style={lbl}>Pricing Model</label><select value={pricingModel} onChange={e=>setPricingModel(e.target.value)} style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option>Fixed Fee (Turnkey)</option><option>Time &amp; Materials</option><option>Unit Rate (Per Vessel)</option></select></div>
              </div>
            </section>
            {/* S2 Financial Structure */}
            <section style={{...glass,borderRadius:16,padding:"2rem",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,right:0,width:256,height:256,background:"rgba(76,214,255,0.05)",filter:"blur(100px)",pointerEvents:"none"}}/>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.5rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>payments</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Financial Structure</h2></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem",marginBottom:"1.5rem"}}>
                <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
                  <div><label style={lbl}>Base Quoted Price</label><div style={{position:"relative"}}><span style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",color:C.slate,fontSize:"1rem"}}>$</span><input type="number" placeholder="0.00" value={basePrice} onChange={e=>setBasePrice(e.target.value)} style={{...inp,paddingLeft:"1.25rem",fontFamily:M,fontSize:"1.1rem"}} onFocus={onF} onBlur={onB}/></div></div>
                  <div><label style={lbl}>Emergency/Weekend Surcharge</label><input type="number" placeholder="0.00" value={surcharge} onChange={e=>setSurcharge(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"1rem 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                    <span style={lbl}>Apply Global Tax (7%)</span>
                    <button onClick={()=>setTaxOn(!taxOn)} style={{width:48,height:24,borderRadius:999,background:taxOn?"#0891b2":"rgba(68,71,77,0.4)",position:"relative",border:"none",cursor:"pointer",flexShrink:0,transition:"background 0.3s"}}>
                      <div style={{position:"absolute",top:2,left:taxOn?26:2,width:20,height:20,background:C.white,borderRadius:"50%",transition:"left 0.3s"}}/>
                    </button>
                  </div>
                  <div><label style={lbl}>Discounts (Optional)</label><input type="text" placeholder="e.g. -5% Loyal Partner" value={discounts} onChange={e=>setDiscounts(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                </div>
              </div>
              <div style={{background:"rgba(0,32,58,0.4)",padding:"1.5rem",borderRadius:12,border:"1px solid rgba(255,255,255,0.05)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><p style={{fontFamily:I,fontSize:"0.65rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",color:C.primary,margin:"0 0 4px"}}>Estimated Grand Total</p><p style={{fontSize:"0.6rem",color:C.slate,textTransform:"uppercase",margin:0}}>Including taxes, surcharges, and logistics fees</p></div>
                <div style={{textAlign:"right"}}>
                  <p style={{fontFamily:M,fontWeight:800,fontSize:"2.25rem",color:C.cyan,margin:0}}>$14,850.00</p>
                  <p style={{fontSize:"0.6rem",color:C.slate,textTransform:"uppercase",letterSpacing:"0.1em",margin:0}}>USD (Locked Rate)</p>
                </div>
              </div>
            </section>
            {/* S3 Timeline */}
            <section style={{...glass,borderRadius:16,padding:"2rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.5rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>calendar_today</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Execution Timeline</h2></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"1.5rem"}}>
                <div><label style={lbl}>Estimated Start</label><input type="date" value={etaStart} onChange={e=>setEtaStart(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                <div><label style={lbl}>Est. Completion</label><input type="date" value={etaEnd} onChange={e=>setEtaEnd(e.target.value)} style={inp} onFocus={onF} onBlur={onB}/></div>
                <div><label style={lbl}>Response Commitment</label><select value={commitment} onChange={e=>setCommitment(e.target.value)} style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option>4-6 Hours</option><option>12 Hours</option><option>24 Hours</option></select></div>
              </div>
            </section>
            {/* S4 Technical Proposal */}
            <section style={{...glass,borderRadius:16,padding:"2rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.5rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>engineering</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Technical Proposal &amp; Scope</h2></div>
              <div style={{background:C.bgLowest,borderRadius:12,border:"1px solid rgba(68,71,77,0.3)",overflow:"hidden",marginBottom:"0.75rem"}}>
                <div style={{display:"flex",gap:"0.5rem",padding:"0.5rem",borderBottom:"1px solid rgba(68,71,77,0.3)",background:"rgba(255,255,255,0.03)"}}>
                  {["format_bold","format_italic","format_list_bulleted","link"].map(icon=>(
                    <button key={icon} style={{padding:"0.5rem",background:"none",border:"none",cursor:"pointer",color:C.muted,display:"flex",borderRadius:4,transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.1)")} onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                      <span className="material-symbols-outlined" style={{fontSize:"1rem"}}>{icon}</span>
                    </button>
                  ))}
                </div>
                <textarea rows={8} value={proposal} onChange={e=>setProposal(e.target.value)} placeholder="Outline the repair methodology, safety protocols, and equipment list..." style={{width:"100%",background:"transparent",border:"none",padding:"1rem",fontSize:"0.875rem",color:"#cbd5e1",fontFamily:I,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",gap:"1.5rem",fontSize:"0.65rem",color:C.slate}}>
                {[{icon:"check_circle",l:"Auto-saved 2m ago"},{icon:"spellcheck",l:"Grammar check active"}].map(item=>(
                  <span key={item.l} style={{display:"flex",alignItems:"center",gap:4}}><span className="material-symbols-outlined" style={{fontSize:"0.875rem"}}>{item.icon}</span>{item.l}</span>
                ))}
              </div>
            </section>
            {/* S5 Team */}
            <section style={{...glass,borderRadius:16,padding:"2rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}><span className="material-symbols-outlined" style={{color:C.cyan}}>groups</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:0}}>Project Resource Allocation</h2></div>
                <button style={{fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:C.cyan,background:"none",border:"none",cursor:"pointer"}}>+ Assign Member</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem"}}>
                <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"1rem",background:"rgba(255,255,255,0.05)",padding:"1rem",borderRadius:12}}>
                    <img src={ENG} alt="Robert Chen" style={{width:48,height:48,borderRadius:8,objectFit:"cover",flexShrink:0}}/>
                    <div style={{flex:1}}><p style={{fontWeight:700,fontSize:"0.875rem",color:C.white,margin:0}}>Robert Chen</p><p style={{fontSize:"0.6rem",color:C.slate,textTransform:"uppercase",margin:0}}>Lead Hydraulic Engineer</p></div>
                    <span className="material-symbols-outlined" style={{color:"#334155",cursor:"pointer"}}>more_vert</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"1rem",background:"rgba(255,255,255,0.05)",padding:"1rem",borderRadius:12,opacity:0.6}}>
                    <div style={{width:48,height:48,background:C.bgHigh,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span className="material-symbols-outlined" style={{color:C.slate}}>person</span></div>
                    <div><p style={{fontWeight:700,fontSize:"0.875rem",color:C.white,margin:0}}>Technician #2</p><p style={{fontSize:"0.6rem",color:C.slate,textTransform:"uppercase",margin:0}}>Field Ops Specialist</p></div>
                  </div>
                </div>
                <div>
                  <p style={lbl}>Active Certifications for Project</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"0.5rem",marginTop:"0.5rem"}}>
                    {CERTS.map(c=>(
                      <span key={c} style={{padding:"4px 12px",background:"rgba(76,214,255,0.1)",color:C.cyan,border:"1px solid rgba(76,214,255,0.2)",borderRadius:999,fontSize:"0.6rem",fontWeight:700}}>{c}</span>
                    ))}
                    <span style={{padding:"4px 12px",background:"rgba(100,116,139,0.1)",color:C.slate,border:"1px solid rgba(100,116,139,0.2)",borderRadius:999,fontSize:"0.6rem",fontWeight:700,opacity:0.5}}>+2 more</span>
                  </div>
                </div>
              </div>
            </section>
            {/* S6 Terms + Attachments */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem"}}>
              <section style={{...glass,borderRadius:16,padding:"2rem"}}>
                <h2 style={{fontFamily:M,fontWeight:800,fontSize:"1.2rem",color:C.white,margin:"0 0 1.5rem"}}>Terms &amp; Legal</h2>
                <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
                  <div><label style={lbl}>Warranty Period</label><select style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option>12 Months Standard</option><option>24 Months Extended</option><option>None</option></select></div>
                  <div><label style={lbl}>Payment Terms</label><select style={{...inp,appearance:"none"}} onFocus={onF} onBlur={onB}><option>Net 30 Days</option><option>Net 15 Days</option><option>Pre-paid 100%</option></select></div>
                </div>
              </section>
              <label style={{...glass,borderRadius:16,padding:"2rem",border:"2px dashed rgba(68,71,77,0.3)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",cursor:"pointer",transition:"border-color 0.2s",boxSizing:"border-box"}} onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(76,214,255,0.5)")} onMouseLeave={e=>(e.currentTarget.style.borderColor="rgba(68,71,77,0.3)")} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFileUpload(e.dataTransfer.files)}}>
                <input type="file" multiple style={{display:"none"}} onChange={e=>handleFileUpload(e.target.files)} />
                <span className="material-symbols-outlined" style={{fontSize:"2.5rem",color:C.slate,marginBottom:"0.5rem",transition:"color 0.2s"}}>cloud_upload</span>
                <h2 style={{fontFamily:M,fontWeight:700,color:C.white,margin:"0 0 0.5rem",fontSize:"1rem"}}>Attachments</h2>
                <p style={{fontSize:"0.75rem",color:C.slate,margin:"0 0 1rem",lineHeight:1.5}}>Drag &amp; drop technical drawings, brochures, or safety manuals (Max 50MB)</p>
                <div style={{display:"flex",gap:"0.5rem"}}>
                  {["picture_as_pdf","image"].map(icon=>(
                    <div key={icon} style={{width:32,height:32,background:"rgba(255,255,255,0.05)",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span className="material-symbols-outlined" style={{fontSize:"1rem",color:C.muted}}>{icon}</span>
                    </div>
                  ))}
                </div>
              </label>
            </div>
          </div>
          {/* RIGHT SIDEBAR */}
          <aside style={{position:"sticky",top:96,display:"flex",flexDirection:"column",gap:"1.5rem"}}>
            {/* Request Summary */}
            <div style={{...glass,borderRadius:16,padding:"1.5rem",borderLeft:"4px solid "+C.cyan}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"1rem"}}>
                <span style={{padding:"4px 8px",background:"rgba(156,202,255,0.1)",color:C.primary,fontSize:"0.6rem",fontWeight:700,borderRadius:4}}>RFP #9910-SGP</span>
                <span style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",background:"rgba(255,180,171,0.1)",color:C.error,fontSize:"0.6rem",fontWeight:700,borderRadius:4}}><span className="material-symbols-outlined" style={{fontSize:"0.75rem"}}>priority_high</span>HIGH PRIORITY</span>
              </div>
              <h3 style={{fontFamily:M,fontWeight:800,fontSize:"1.4rem",color:C.white,margin:"0 0 0.5rem"}}>Hydraulic Pump Overhaul</h3>
              <div style={{display:"flex",alignItems:"center",gap:6,color:C.slate,fontSize:"0.875rem",marginBottom:"1.5rem"}}>
                <span className="material-symbols-outlined" style={{fontSize:"1rem"}}>location_on</span>Port of Singapore (PSA Terminal)
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.75rem",padding:"1rem 0",borderTop:"1px solid rgba(255,255,255,0.05)",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.875rem"}}><span style={{color:C.slate}}>Vessel</span><span style={{color:C.white,fontWeight:500}}>MV Horizon Explorer</span></div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.875rem"}}><span style={{color:C.slate}}>Response Deadline</span><span style={{color:C.error,fontWeight:500}}>18h 42m remaining</span></div>
              </div>
              <div style={{marginTop:"1rem"}}>
                <p style={lbl}>Key Requirements</p>
                <ul style={{listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:"0.5rem"}}>
                  {["On-site repair within 48h of docking.","Genuine Rexroth spare parts only."].map(r=>(
                    <li key={r} style={{display:"flex",alignItems:"flex-start",gap:"0.5rem",fontSize:"0.75rem",color:"#94a3b8"}}><span className="material-symbols-outlined" style={{fontSize:"0.875rem",color:C.cyan,flexShrink:0}}>check_circle</span>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
            {/* Client */}
            <div style={{...glass,borderRadius:16,padding:"1.5rem",background:"rgba(21,28,38,0.5)"}}>
              <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1.5rem"}}>
                <div style={{width:48,height:48,background:"rgba(255,255,255,0.1)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span className="material-symbols-outlined" style={{fontSize:"1.5rem",color:C.white}}>domain</span></div>
                <div>
                  <h4 style={{fontWeight:700,color:C.white,margin:0}}>Ocean Shipping Ltd</h4>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                    <span style={{fontSize:"0.75rem",color:C.cyan}}>★ 4.9 Verified</span>
                    <span style={{width:4,height:4,borderRadius:"50%",background:"#334155",display:"inline-block"}}/>
                    <span style={{fontSize:"0.6rem",color:C.slate,textTransform:"uppercase"}}>UK Based</span>
                  </div>
                </div>
              </div>
              <div style={{background:"rgba(255,255,255,0.05)",padding:"1rem",borderRadius:10}}>
                <p style={{fontSize:"0.6rem",color:C.slate,textTransform:"uppercase",margin:"0 0 4px"}}>Previous Collaborations</p>
                <p style={{fontFamily:M,fontWeight:700,fontSize:"1.2rem",color:C.white,margin:0}}>12 <span style={{fontSize:"0.75rem",color:C.slate,fontWeight:400}}>Completed Contracts</span></p>
              </div>
            </div>
            {/* Match */}
            <div style={{...glass,borderRadius:16,padding:"1.5rem",position:"relative",overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
                <p style={lbl}>Smart Match Insights</p>
                <span style={{fontFamily:M,fontWeight:900,fontSize:"1.5rem",color:C.cyan}}>96%</span>
              </div>
              <div style={{width:"100%",height:6,background:"rgba(255,255,255,0.1)",borderRadius:999,overflow:"hidden",marginBottom:"1.5rem"}}>
                <div style={{width:"96%",height:"100%",background:"linear-gradient(to right,#4cd6ff,#3b82f6)",borderRadius:999}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
                {[{icon:"bolt",t:"High match based on your heavy port coverage in Singapore."},{icon:"info",t:"Competitors typically respond within 12 hours for this route."}].map(item=>(
                  <div key={item.icon} style={{display:"flex",alignItems:"flex-start",gap:"0.75rem"}}>
                    <span className="material-symbols-outlined" style={{color:C.cyan,fontSize:"1.2rem",flexShrink:0}}>{item.icon}</span>
                    <p style={{fontSize:"0.75rem",color:"#cbd5e1",margin:0,lineHeight:1.5}}>{item.t}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
      {/* BOTTOM BAR */}
      <div style={{position:"fixed",bottom:0,left:288,right:0,...glass,borderTop:"1px solid rgba(255,255,255,0.05)",zIndex:50,padding:"1.25rem 2.5rem"}}>
        <div style={{maxWidth:1400,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:"2.5rem"}}>
            <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
              <div style={{position:"relative",width:48,height:48,flexShrink:0}}>
                <svg width={48} height={48} style={{transform:"rotate(-90deg)"}}>
                  <circle cx={24} cy={24} r={20} fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth={4}/>
                  <circle cx={24} cy={24} r={20} fill="transparent" stroke={C.cyan} strokeWidth={4} strokeDasharray="125.6" strokeDashoffset={10}/>
                </svg>
                <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.6rem",fontWeight:900}}>92%</span>
              </div>
              <div>
                <p style={{fontWeight:700,fontSize:"0.875rem",color:C.white,margin:0}}>Quote Quality Score</p>
                <p style={{fontSize:"0.65rem",color:C.slate,margin:0}}>Suggestion: Add a company brochure to reach 100%.</p>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"1rem",paddingLeft:"2.5rem",borderLeft:"1px solid rgba(255,255,255,0.1)"}}>
              {[{icon:"check",l:"Pricing",done:true},{icon:"check",l:"Team",done:true},{icon:"pending",l:"Proposal",done:false}].map(item=>(
                <span key={item.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:item.done?C.cyan:"#334155"}}>
                  <span className="material-symbols-outlined" style={{fontSize:"0.875rem"}}>{item.icon}</span>{item.l}
                </span>
              ))}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
            <button style={{padding:"0.75rem 1.5rem",borderRadius:8,background:"transparent",border:"none",cursor:"pointer",fontSize:"0.875rem",fontWeight:700,color:C.muted,transition:"all 0.2s"}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color=C.white;(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.05)";}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color=C.muted;(e.currentTarget as HTMLElement).style.background="transparent";}}>Save Draft</button>
            <button style={{padding:"0.75rem 1.5rem",borderRadius:8,border:"1px solid rgba(68,71,77,0.4)",background:"transparent",cursor:"pointer",fontSize:"0.875rem",fontWeight:700,color:C.text,transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.05)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>Preview Quote</button>
            <button onClick={handleSubmit} disabled={submitting} style={{padding:"0.75rem 2.5rem",borderRadius:8,background:"linear-gradient(to right,#0891b2,#2563eb)",color:C.white,fontWeight:700,fontSize:"0.875rem",border:"none",cursor:submitting?"not-allowed":"pointer",opacity:submitting?0.7:1,boxShadow:"0 10px 20px rgba(0,180,255,0.2)",transition:"all 0.2s"}} onMouseEnter={e=>{if(!submitting) e.currentTarget.style.transform="scale(1.05)"}} onMouseLeave={e=>(e.currentTarget.style.transform="none")}>{submitting ? "Submitting..." : "Submit Quotation"}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default SubmitQuotation;
