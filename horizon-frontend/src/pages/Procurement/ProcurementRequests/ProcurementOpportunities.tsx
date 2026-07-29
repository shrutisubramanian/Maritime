import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { requestsService } from "../../../services/requests";
import { quotesService } from "../../../services/quotes";

const C={bg:"#050B14",bgCard:"rgba(255,255,255,0.05)",bgCardH:"rgba(255,255,255,0.1)",bgLow:"rgba(255,255,255,0.03)",bgLowest:"#080f18",text:"#dce3f0",muted:"#c4c6ce",dim:"#8e9098",slate:"#64748b",cyan:"#4cd6ff",primary:"#9ccaff",secondary:"#a6c9fa",error:"#f87171",amber:"#fbbf24",green:"#4ade80",white:"#ffffff",border:"rgba(255,255,255,0.1)"};
const M="Manrope,sans-serif",I="Inter,sans-serif";
const glass:React.CSSProperties={background:C.bgCard,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:`1px solid ${C.border}`};
const glow:React.CSSProperties={boxShadow:"0 20px 40px rgba(0,209,255,0.08)"};
const PROF="https://lh3.googleusercontent.com/aida-public/AB6AXuCObGSeMxnZ2DW9-7H1I2WHjhz2nAlsMB1lr-Jx0kOsZh3E2QdS-J9LgPTgjNOjG9feS1ijpTLYM3760tNv52J-EMM8XmTKs-NOP5Z8-cmeOPqzN_k3-LWq1opCNTyZqyoHOhh8mSm8OSHBCuhN7i2NP6_e604F62bHp_qMMomqBcKQnJ8HRCgSMTPnoWOPKcuSQD7kOFYS8gorg2zdmrzXqxnunOM2J2cvHwDM2x04Kb4maEUtR-kk-ix-Ot0Kb1_17phhiaqPR43D";
const BANNER="https://lh3.googleusercontent.com/aida-public/AB6AXuBoGTOn6nZJ8IwDjF1sO3-wKgR5HVpSoZxxiSTZR_u8RsS-ncyStDqoBzEmNYBqpsZbqsWbmBQdCSGt4W7uFa00Tc7xoDpZyz-OJNiRxMXTagDCKaVItdeVrUxSWdRuG_2RYJOETo9KonRnWZJpzXBvPESMw4fEerI0xGIR-5r7DGuxNMzjM0W25E_0vVUGmrdkARThvG13c9_QJA8A2qNgK4xVC-U6_oGhBoH92UDzhnbtB1ctE7EDVi8YdSO9N6qagx_33YW_Diy5";
const LOGOS=["https://lh3.googleusercontent.com/aida-public/AB6AXuAcH6eA-XAfk6-tLMdLO7Jso0xwOkuMTJfPXAt64pt1HcbFXykGWeylm1V1RVOhu6pY1yRqGPkw3wK8uVVOcG6HTrOkck7b91eksFAI2M9_YvpZfTofU-N66i_B_VqTUMOBO570El0ZdNKgpB4Ra7INrpTpGktLWHhfzVjJuBRJWCf6fSgmv73zw-aezG82aVUsKfivAkLbGntiVBlONelIrtGgC_c-GI90YZ-LxsgFZIQ9LeySyMf5fnxHzt9iVmPCJ4tiMAM1cLw5","https://lh3.googleusercontent.com/aida-public/AB6AXuBofKxtfa4jXtBgR570RtTVjsqFpyHcBqpbEoFcMe4iPtaHJ3__ZsMEAdMApUcnCZVj50h6KmyDgyTck4t-QsLEnSK-DFibKj42rX8ZYIZtur99nofyy6xXELt4CDTHTYuKQB_u8IavB_dn6rDVbQjXhe9gFxXELy3Xw5TajgWy976I3eq_QMKo0kVySTXpdlrNpzGwpTT6tCxozzp_pWCk_JjtjNrJHIYevO8ChdSm3xBR6ds0Khqxrp5SHmBu6-j9aSybl8f8mKQq","https://lh3.googleusercontent.com/aida-public/AB6AXuBg0e32DpNMwPpfWwHY_09R0_aDz_xxsj1VX1_i1gxLMTW4nMUDkqfzArsqJAfhdPSSGIouzw7RhsL1NXkjLloo-jODe8_fug04kaKJei2hpXj_-yEjA7MUTXPaLD0gqkV1D3Vxbz8_qd3463byUonjtOzTY5m1QNf-P8Sh8yfpCWMtNV6CJqBO0LHtaD9UpHiiaUrTHRCzCxlVyT1isOEBbP2xfaOXACq4vQaibWaeY9nPpmJMEeh7fDI6jXuNJvLQKkyRoKGnuTh_"];
const OPPS=[{borderColor:C.error,priority:"Emergency Priority",priorityBg:"rgba(248,113,113,0.2)",priorityColor:C.error,tag:"New Request",tagBg:"rgba(76,214,255,0.2)",tagColor:C.cyan,title:"Hydraulic Pump Repair",match:"96%",matchSub:"Matches services & port availability",port:"Singapore",vessel:"MV Horizon (Container)",eta:"Oct 24, 2023",budget:"Verified Flexible",company:"Ocean Shipping Ltd",rating:"4.9",logo:LOGOS[0],desc:"Urgent repair needed for port-side hydraulic pump system. Leak detected in main pressure line. Technical drawing and diagnostic report attached for quotation preparation.",tags:["Technical Drawing.pdf","Pump_Photo_01.jpg","OEM Mandatory","ISO 9001 Required"]},{borderColor:C.amber,priority:"High Priority",priorityBg:"rgba(251,191,36,0.2)",priorityColor:C.amber,tag:"Open",tagBg:"rgba(100,116,139,0.2)",tagColor:C.muted,title:"Annual Fire Safety Inspection",match:"92%",matchSub:"Matches certifications & location",port:"Rotterdam",vessel:"Maersk Tianjin (Bulk Carrier)",eta:"Nov 02, 2023",budget:"$12,000 - $15,000",company:"Northern Marine Group",rating:"4.7",logo:LOGOS[1],desc:"",tags:[]},{borderColor:C.cyan,priority:"Medium Priority",priorityBg:"rgba(76,214,255,0.2)",priorityColor:C.cyan,tag:"Closing Soon",tagBg:"rgba(248,113,113,0.2)",tagColor:C.error,title:"Main Engine Overhaul",match:"88%",matchSub:"Matches technical specialization",port:"Dubai",vessel:"MSC Elmira (Post-Panamax)",eta:"Nov 15, 2023",budget:"High Scale Project",company:"MSC Mediterranean",rating:"4.8",logo:LOGOS[2],desc:"",tags:[]}];
const NAV=[{icon:"dashboard",l:"Dashboard",p:"/provider-dashboard"},{icon:"directions_boat",l:"Vessel Tracking",p:"/provider-dashboard"},{icon:"storefront",l:"Marketplace",p:"/procurement-opportunities",active:true},{icon:"description",l:"Contract Management",p:"/provider-dashboard"},{icon:"insights",l:"Analytics",p:"/analytics"}];

export const ProcurementOpportunities: React.FC = () => {
  const navigate = useNavigate();
  const [opps, setOpps] = useState<any[]>([]);
  const [submittedQuotes, setSubmittedQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [reqRes, quoteRes] = await Promise.all([
          requestsService.getUserRequests({ status: 'open' }),
          quotesService.getMyQuotations()
        ]);
        setOpps(reqRes.data || reqRes || []);
        setSubmittedQuotes(quoteRes || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const unquotedOpps = opps.filter(o => !submittedQuotes.some(q => q.request_id === o.id));
  return (
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:"100vh",overflowX:"hidden"}}>

      {/* TOP NAV */}
      <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:50,height:64,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 1.5rem",background:"rgba(5,11,20,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",boxShadow:"0 20px 40px rgba(0,209,255,0.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"2rem"}}>
          <span style={{fontFamily:M,fontWeight:700,fontSize:"1.2rem",color:"#f1f5f9",letterSpacing:"-0.03em"}}>Oceanic Horizon Marketplace</span>
          <div style={{display:"flex",gap:"1.5rem"}}>
            {[{l:"Marketplace",active:true,p:"/procurement-opportunities"},{l:"Vessels",p:"/provider-dashboard"},{l:"Global Insights",p:"/analytics"}].map(n=>(
              <a key={n.l} href="#" onClick={e=>{e.preventDefault();navigate(n.p);}} style={{color:n.active?C.cyan:"#94a3b8",fontWeight:n.active?700:500,fontSize:"0.875rem",textDecoration:"none",borderBottom:n.active?("2px solid "+C.cyan):"none",paddingBottom:n.active?4:0}}>{n.l}</a>
            ))}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
          {["notifications","help_outline","account_balance_wallet"].map(icon=>(
            <span key={icon} className="material-symbols-outlined" style={{color:"#94a3b8",cursor:"pointer",fontSize:"1.4rem"}}>{icon}</span>
          ))}
          <div style={{width:32,height:32,borderRadius:"50%",overflow:"hidden",border:"1px solid rgba(76,214,255,0.3)"}}>
            <img src={PROF} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
        </div>
      </nav>

      {/* SIDE NAV */}
      <aside style={{position:"fixed",left:0,top:64,bottom:0,width:256,zIndex:40,display:"flex",flexDirection:"column",padding:"2rem 0",background:"rgba(15,23,36,0.6)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRight:"1px solid rgba(255,255,255,0.05)"}}>
        <div style={{padding:"0 1.5rem",marginBottom:"2rem"}}>
          <h3 style={{fontFamily:M,fontWeight:900,fontSize:"1rem",color:"#f8fafc",textTransform:"uppercase",margin:0}}>Fleet Command</h3>
          <p style={{fontSize:"0.55rem",color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.2em",margin:"4px 0 0"}}>Global Operations</p>
        </div>
        <nav style={{flex:1,padding:"0 0.75rem",display:"flex",flexDirection:"column",gap:2}}>
          {NAV.map(item=>(
            <a key={item.l} href="#" onClick={e=>{e.preventDefault();navigate(item.p);}}
              style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.75rem",borderRadius:"0 999px 999px 0",textDecoration:"none",color:item.active?C.cyan:"#64748b",background:item.active?"rgba(76,214,255,0.1)":"transparent",borderLeft:item.active?("4px solid "+C.cyan):"4px solid transparent",fontWeight:item.active?700:400,transition:"all 0.2s"}}
              onMouseEnter={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.05)";(e.currentTarget as HTMLElement).style.color="#e2e8f0";}}}
              onMouseLeave={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background="transparent";(e.currentTarget as HTMLElement).style.color="#64748b";}}}>
              <span className="material-symbols-outlined" style={{fontSize:"1.2rem"}}>{item.icon}</span>
              <span style={{fontSize:"0.7rem",textTransform:"uppercase",letterSpacing:"0.1em"}}>{item.l}</span>
            </a>
          ))}
        </nav>
        <div style={{padding:"1rem 1.5rem"}}>
          <button style={{width:"100%",padding:"0.75rem",background:"linear-gradient(to right,#0891b2,#1d4ed8)",color:C.white,fontWeight:700,fontSize:"0.875rem",border:"none",borderRadius:12,cursor:"pointer"}}>Schedule Cargo</button>
          <div style={{marginTop:"1.5rem",paddingTop:"1.5rem",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",gap:"0.75rem"}}>
            {[{icon:"settings",l:"Settings"},{icon:"support_agent",l:"Support"}].map(s=>(
              <div key={s.l} style={{display:"flex",alignItems:"center",gap:"0.75rem",color:"#64748b",cursor:"pointer"}}>
                <span className="material-symbols-outlined" style={{fontSize:"1.2rem"}}>{s.icon}</span>
                <span style={{fontSize:"0.65rem",textTransform:"uppercase",letterSpacing:"0.15em"}}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{marginLeft:256,paddingTop:80,padding:"80px 2.5rem 5rem 2.5rem",display:"grid",gridTemplateColumns:"1fr 320px",gap:"2rem",alignItems:"start"}}>
        <div>
          {/* HEADER */}
          <header style={{marginBottom:"2.5rem",display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:"1.5rem"}}>
            <div>
              <h1 style={{fontFamily:M,fontWeight:800,fontSize:"clamp(1.75rem,3vw,2.5rem)",letterSpacing:"-0.04em",color:"#f8fafc",margin:"0 0 0.5rem"}}>Procurement Opportunities</h1>
              <p style={{color:C.muted,fontSize:"1rem",lineHeight:1.6,maxWidth:540,margin:0,fontWeight:300}}>Browse procurement requests from verified maritime clients and submit competitive quotations for worldwide maritime logistics.</p>
            </div>
            <div style={{display:"flex",gap:"0.75rem"}}>
              {[{icon:"bookmark",l:"Saved Opportunities"},{icon:"description",l:"My Submitted Quotes"}].map(b=>(
                <button key={b.l} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.6rem 1.25rem",...glass,borderRadius:12,fontSize:"0.8rem",fontWeight:600,color:C.text,border:"none",cursor:"pointer",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgCardH)} onMouseLeave={e=>(e.currentTarget.style.background=C.bgCard)}>
                  <span className="material-symbols-outlined" style={{fontSize:"1.1rem"}}>{b.icon}</span>{b.l}
                </button>
              ))}
            </div>
          </header>

          {/* KPI */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"1rem",marginBottom:"2.5rem"}}>
            {[{l:"New Opportunities",v:"48",color:C.cyan},{l:"Matching Services",v:"27",color:"#f8fafc"},{l:"Quotes Submitted",v:"19",color:"#f8fafc"},{l:"Won Contracts",v:"8",color:C.cyan}].map(k=>(
              <div key={k.l} style={{...glass,padding:"1.5rem",borderRadius:16,position:"relative",overflow:"hidden",...glow}}>
                <div style={{position:"absolute",top:0,right:0,width:96,height:96,background:"rgba(76,214,255,0.05)",borderRadius:"50%",transform:"translate(33%,-33%)"}}/>
                <p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em",color:C.muted,margin:"0 0 0.5rem"}}>{k.l}</p>
                <h3 style={{fontFamily:M,fontWeight:700,fontSize:"2rem",color:k.color,margin:0}}>{k.v}</h3>
              </div>
            ))}
          </div>

          {/* SEARCH */}
          <div style={{display:"flex",flexDirection:"column",gap:"0.75rem",marginBottom:"2rem"}}>
            <div style={{position:"relative"}}>
              <span className="material-symbols-outlined" style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#64748b",fontSize:"1.2rem",pointerEvents:"none"}}>search</span>
              <input type="text" placeholder="Search by request title, vessel, port or IMPA code..." style={{width:"100%",background:"#080f18",border:"none",borderBottom:"2px solid rgba(68,71,77,0.4)",borderRadius:12,padding:"1rem 1rem 1rem 42px",fontSize:"1rem",color:C.text,fontFamily:"Inter",outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} onFocus={e=>(e.currentTarget.style.borderBottomColor=C.cyan)} onBlur={e=>(e.currentTarget.style.borderBottomColor="rgba(68,71,77,0.4)")}/>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"0.5rem"}}>
              {["Category","Port","Priority","Vessel Type","Budget Range","Deadline"].map(label=>(
                <select key={label} style={{background:"#0f172a",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"6px 14px",fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:C.muted,cursor:"pointer",outline:"none"}}>
                  <option>{label}</option>
                </select>
              ))}
            </div>
          </div>

          {/* OPPORTUNITY CARDS */}
          <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: C.cyan }}>Loading opportunities...</div>
            ) : unquotedOpps.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', background: C.bgLow, borderRadius: 24, border: `1px dashed ${C.border}` }}>
                <p style={{ color: C.muted, margin: 0 }}>You have quoted on all available opportunities!</p>
              </div>
            ) : unquotedOpps.map((o,i)=>(
              <div key={i} style={{...glass,borderRadius:16,padding:"1.5rem",borderLeft:"4px solid "+ (o.urgency === 'urgent' ? C.error : C.cyan),transition:"box-shadow 0.3s",...glow}} onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 0 30px rgba(0,209,255,0.1)")} onMouseLeave={e=>(e.currentTarget.style.boxShadow=glow.boxShadow as string)}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"1rem",marginBottom:"1rem",flexWrap:"wrap"}}>
                  <div>
                    <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.5rem",flexWrap:"wrap"}}>
                      <span style={{padding:"2px 8px",background: o.urgency === 'urgent' ? 'rgba(248,113,113,0.2)' : 'rgba(76,214,255,0.2)',color: o.urgency === 'urgent' ? C.error : C.cyan,fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",borderRadius:4}}>{o.urgency || "Normal"}</span>
                      <span style={{padding:"2px 8px",background: 'rgba(76,214,255,0.2)',color: C.cyan,fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",borderRadius:4}}>{"Open"}</span>
                    </div>
                    <h2 style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:"#f8fafc",margin:0,transition:"color 0.2s",cursor:"default"}} onMouseEnter={e=>(e.currentTarget.style.color=C.cyan)} onMouseLeave={e=>(e.currentTarget.style.color="#f8fafc")}>{o.title || o.service_type}</h2>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.5rem",color:C.cyan,fontWeight:700,fontSize:"1.2rem",justifyContent:"flex-end"}}>
                      <span className="material-symbols-outlined" style={{fontSize:"1rem"}}>verified_user</span>{"New"} Match
                    </div>
                    <p style={{fontSize:"0.6rem",color:"#475569",textTransform:"uppercase",letterSpacing:"0.08em",margin:"4px 0 0"}}>{"Matched"}</p>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"1.5rem",marginBottom:"1rem"}}>
                  <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
                    {[{icon:"anchor",l:"Port:",v:o.port},{icon:"directions_boat",l:"Vessel:",v:o.vessel}].map(r=>(
                      <div key={r.l} style={{display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.875rem",color:C.muted}}>
                        <span className="material-symbols-outlined" style={{fontSize:"1rem",color:C.cyan}}>{r.icon}</span>{r.l} <span style={{color:"#f1f5f9",fontWeight:500,marginLeft:4}}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
                    {[{icon:"schedule",l:"ETA:",v:o.eta},{icon:"monetization_on",l:"Budget:",v:o.budget}].map(r=>(
                      <div key={r.l} style={{display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.875rem",color:C.muted}}>
                        <span className="material-symbols-outlined" style={{fontSize:"1rem",color:C.cyan}}>{r.icon}</span>{r.l} <span style={{color:"#f1f5f9",fontWeight:500,marginLeft:4}}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"0.75rem",display:"flex",alignItems:"center",gap:"0.75rem"}}>
                    <div style={{width:40,height:40,borderRadius:"50%",overflow:"hidden",background:"#1e293b",flexShrink:0}}><img src={LOGOS[i % LOGOS.length]} alt={o.client?.company_name || "Unknown Company"} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
                    <div>
                      <p style={{fontSize:"0.75rem",fontWeight:700,color:"#f1f5f9",margin:0}}>{o.client?.company_name || "Unknown Company"}</p>
                      <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                        <span style={{fontSize:"0.65rem",color:"#eab308"}}>★ {"4.8"}</span>
                        <span style={{padding:"2px 6px",background:"rgba(74,222,128,0.1)",color:C.green,fontSize:"0.55rem",fontWeight:700,borderRadius:4}}>Verified</span>
                      </div>
                    </div>
                  </div>
                </div>
                {o.desc&&<p style={{fontSize:"0.875rem",color:"#94a3b8",marginBottom:"1rem",lineHeight:1.6}}>{o.description}</p>}
                {false&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:"0.5rem",marginBottom:"1rem"}}>
                    {o.tags.map((t: string, j: number)=>(
                      <span key={j} style={{padding:"4px 12px",background:t.includes(".pdf")||t.includes(".jpg")?"#1e293b":"transparent",border:t.includes(".pdf")||t.includes(".jpg")?"none":"1px solid rgba(76,214,255,0.3)",borderRadius:999,fontSize:"0.6rem",textTransform:"uppercase",letterSpacing:"0.08em",color:t.includes(".pdf")||t.includes(".jpg")?C.muted:C.cyan}}>{t}</span>
                    ))}
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:"1rem",borderTop:"1px solid rgba(255,255,255,0.05)"}}>
                  <button style={{color:C.cyan,fontSize:"0.875rem",fontWeight:700,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}} onMouseEnter={e=>(e.currentTarget.style.textDecoration="underline")} onMouseLeave={e=>(e.currentTarget.style.textDecoration="none")}>
                    View Full Request <span className="material-symbols-outlined" style={{fontSize:"1rem"}}>chevron_right</span>
                  </button>
                  <div style={{display:"flex",gap:"0.75rem"}}>
                    <button style={{padding:"0.6rem",...glass,borderRadius:10,border:"none",cursor:"pointer",color:C.text,display:"flex",alignItems:"center",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgCardH)} onMouseLeave={e=>(e.currentTarget.style.background=C.bgCard)}>
                      <span className="material-symbols-outlined">save</span>
                    </button>
                    <button onClick={() => navigate(`/submit-quotation?requestId=${o.id}`)} style={{padding:"0.6rem 1.5rem",background:C.cyan,color:"#020617",borderRadius:10,fontWeight:700,fontSize:"0.875rem",border:"none",cursor:"pointer",letterSpacing:"0.05em",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background="#a5f3fc")} onMouseLeave={e=>(e.currentTarget.style.background=C.cyan)}>
                      Submit Quotation
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* GLOBAL MARKET INSIGHTS */}
          <section style={{marginTop:"3rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"2rem"}}>
              <h2 style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:"#f1f5f9",margin:0}}>Global Market Insights</h2>
              <button style={{fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em",color:C.cyan,background:"none",border:"none",cursor:"pointer"}} onMouseEnter={e=>(e.currentTarget.style.color="#a5f3fc")} onMouseLeave={e=>(e.currentTarget.style.color=C.cyan)}>View Full Reports</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1.5rem"}}>
              {[{icon:"construction",iconBg:"rgba(76,214,255,0.1)",iconColor:C.cyan,sub:"Highest Demand Service",title:"Engine Retrofitting",trend:"+24% this QTR"},{icon:"map",iconBg:"rgba(156,202,255,0.1)",iconColor:C.primary,sub:"Fastest Growing Port",title:"Port of Neom",trend:"+312% Growth"},{icon:"receipt_long",iconBg:"rgba(76,214,255,0.1)",iconColor:C.cyan,sub:"Avg. Quotation Value",title:",800 USD",trend:"Across all certified suppliers"}].map(m=>(
                <div key={m.title} style={{...glass,padding:"1.5rem",borderRadius:16,display:"flex",alignItems:"flex-start",gap:"1rem"}}>
                  <div style={{width:48,height:48,borderRadius:12,background:m.iconBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span className="material-symbols-outlined" style={{fontSize:"1.75rem",color:m.iconColor}}>{m.icon}</span>
                  </div>
                  <div>
                    <p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",color:"#475569",margin:"0 0 4px"}}>{m.sub}</p>
                    <h4 style={{fontFamily:M,fontWeight:700,fontSize:"1rem",color:"#f1f5f9",margin:"0 0 4px"}}>{m.title}</h4>
                    <p style={{fontSize:"0.75rem",color:C.green,margin:0,display:"flex",alignItems:"center",gap:4}}><span className="material-symbols-outlined" style={{fontSize:"0.875rem"}}>trending_up</span>{m.trend}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT SIDEBAR */}
        <aside style={{position:"sticky",top:88,display:"flex",flexDirection:"column",gap:"1.5rem"}}>
          {/* Insights */}
          <div style={{...glass,padding:"2rem",borderRadius:24,position:"relative",overflow:"hidden",...glow}}>
            <div style={{position:"absolute",top:0,right:0,padding:"1rem",opacity:0.1}}><span className="material-symbols-outlined" style={{fontSize:"4.5rem"}}>trending_up</span></div>
            <h3 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:"#f1f5f9",margin:"0 0 1.5rem"}}>Today's Insights</h3>
            <p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em",color:"#475569",margin:"0 0 0.75rem"}}>Top Matching Categories</p>
            {[{l:"Engine Parts & Repair",pct:85},{l:"Safety Equipment",pct:72}].map(item=>(
              <div key={item.l} style={{marginBottom:"1rem"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.35rem"}}>
                  <span style={{fontSize:"0.875rem",color:"#cbd5e1"}}>{item.l}</span>
                  <span style={{fontSize:"0.75rem",fontWeight:700,color:C.cyan}}>{item.pct}% Match</span>
                </div>
                <div style={{width:"100%",height:4,background:"rgba(255,255,255,0.05)",borderRadius:999,overflow:"hidden"}}>
                  <div style={{width:item.pct+"%",height:"100%",background:C.cyan,borderRadius:999}}/>
                </div>
              </div>
            ))}
            <div style={{paddingTop:"1.5rem",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",justifyContent:"space-between"}}>
              <div><p style={{fontSize:"0.6rem",textTransform:"uppercase",letterSpacing:"0.12em",color:"#475569",margin:"0 0 4px"}}>Avg. Project Budget</p><h4 style={{fontFamily:M,fontWeight:700,fontSize:"1.2rem",color:"#f1f5f9",margin:0}}>,500</h4></div>
              <div style={{textAlign:"right"}}><p style={{fontSize:"0.6rem",textTransform:"uppercase",letterSpacing:"0.12em",color:"#475569",margin:"0 0 4px"}}>Closing Soon</p><h4 style={{fontFamily:M,fontWeight:700,fontSize:"1.2rem",color:C.error,margin:0}}>12 Requests</h4></div>
            </div>
          </div>
          {/* Smart Rec */}
          <div style={{...glass,padding:"2rem",borderRadius:24,border:"2px solid rgba(76,214,255,0.2)",background:"rgba(76,214,255,0.05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",color:C.cyan,marginBottom:"1rem"}}>
              <span className="material-symbols-outlined">stars</span>
              <span style={{fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em"}}>Smart Recommendation</span>
            </div>
            <h4 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:"#f1f5f9",margin:"0 0 0.5rem"}}>Main Deck Sandblasting</h4>
            <p style={{fontSize:"0.875rem",color:"#94a3b8",lineHeight:1.6,margin:"0 0 1.5rem"}}>High demand category in Dubai Port this month. Your previous 5-star rating for similar jobs makes you a top candidate.</p>
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:"0.875rem",color:"#f1f5f9",marginBottom:"1.5rem"}}>
              <span className="material-symbols-outlined" style={{color:C.cyan,fontSize:"1rem"}}>location_on</span>Dubai Drydocks
            </div>
            <button style={{width:"100%",padding:"0.75rem",...glass,color:C.text,fontWeight:700,fontSize:"0.875rem",border:"none",cursor:"pointer",borderRadius:12,transition:"all 0.2s"}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=C.cyan;(e.currentTarget as HTMLElement).style.color="#020617";}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=C.bgCard;(e.currentTarget as HTMLElement).style.color=C.text;}}>View Details</button>
          </div>
          {/* Banner */}
          <div style={{borderRadius:24,height:192,position:"relative",overflow:"hidden",cursor:"pointer"}}>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#020617,rgba(2,6,23,0.4),transparent)",zIndex:1}}/>
            <img src={BANNER} alt="Upgrade" style={{width:"100%",height:"100%",objectFit:"cover",transition:"transform 0.7s"}} onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.1)")} onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}/>
            <div style={{position:"absolute",bottom:0,left:0,padding:"1.5rem",zIndex:2}}>
              <p style={{fontSize:"0.6rem",fontWeight:700,color:C.cyan,textTransform:"uppercase",letterSpacing:"0.2em",margin:"0 0 4px"}}>Premium Feature</p>
              <h4 style={{fontFamily:M,fontWeight:700,fontSize:"1rem",color:"#f1f5f9",margin:"0 0 4px"}}>Upgrade to Global Vision</h4>
              <p style={{fontSize:"0.75rem",color:"#94a3b8",margin:0}}>Get early access to RFQs and deep market analysis.</p>
            </div>
          </div>
        </aside>
      </main>

      {/* FOOTER */}
      <footer style={{marginLeft:256,padding:"2.5rem",borderTop:"1px solid rgba(255,255,255,0.05)",background:"rgba(5,11,20,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"1rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
            <span style={{fontFamily:M,fontWeight:900,fontSize:"1rem",color:"#64748b",letterSpacing:"-0.02em"}}>Oceanic Horizon</span>
            <span style={{fontSize:"0.6rem",color:"#334155",textTransform:"uppercase",letterSpacing:"0.15em"}}>© 2023 Fleet Command System</span>
          </div>
          <div style={{display:"flex",gap:"2rem"}}>
            {["Privacy Policy","Terms of Service","Compliance"].map(l=>(
              <a key={l} href="#" style={{fontSize:"0.65rem",color:"#64748b",textTransform:"uppercase",letterSpacing:"0.12em",textDecoration:"none",transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.cyan)} onMouseLeave={e=>(e.currentTarget.style.color="#64748b")}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};
export default ProcurementOpportunities;
