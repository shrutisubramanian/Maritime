import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { requestsService } from "../../../services/requests";

const C={bg:"#0d141d",bgCard:"#19202a",bgCardH:"#242a34",bgHigh:"#2e353f",bgBright:"#333a44",bgLowest:"#080f18",bgLow:"#151c26",border:"rgba(68,71,77,0.2)",borderV:"rgba(255,255,255,0.05)",text:"#dce3f0",muted:"#c4c6ce",dim:"#8e9098",cyan:"#4cd6ff",cyanCont:"#00222c",primary:"#9ccaff",primCont:"#00203a",secondary:"#a6c9fa",secCont:"#244872",error:"#ffb4ab",white:"#ffffff",green:"#86efac",slate:"#94a3b8"};
const M="Manrope,sans-serif",I="Inter,sans-serif";
const glass:React.CSSProperties={background:"rgba(46,53,63,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"};
const PROF="https://lh3.googleusercontent.com/aida-public/AB6AXuCVnV3kV_gw2c4mSX2mqGf4xVSuuycly4iu5nFKj2Tp9lqoqt3s7ml53hw60x7qH2dPB77GwEy-9pW6aeDM8FFjr8qATfuAZOqzZhcFZZdr1GiLltVeU3ZS1Yz2w59qepj-6P8pIGm66GEk9ZuEz9hw6VJtsolakCmjZU49c3TGY5OySDeQuFpRDudz7nSupE3vxlaenATIgjwsiv1wAla_6iRYBRsmwHtW7OYpqMd4v6vfMp4-go9XLA";
const PROVIDERS=[
  {logo:"https://lh3.googleusercontent.com/aida-public/AB6AXuBB6vMV2ES7s2jIjgk_daOGri0FD_vWyAMmCEsdNAShEZoMss9NNZ-ch_Pz22JgrTMGd0fz75ed9r7R3euqOhLPjdb-xu9hun9ijXpxRtmZnTGFDRbgud1SVwxcyh9Qw2ZyZcrwMJq8OSD4IRyPK-NnrcwLCq3HNv47u4vNUG71Ymf3yE1xcKAM4SYiRLR5WekpyGNwnk-AkiQx8Ixz84CNSEOk-sbDJ9Dymxycnu4LNcNWvB39TFf_GQ",badge:"Highest Rated",badgeBg:C.primCont,badgeColor:C.primary,name:"Maersk Technical",price:"$142,500.00",timeline:"14 Days",warranty:"24 Months Full",stars:4,halfStar:true,rating:"4.9",jobs:"1,240+ Ships",response:"2.4 Hours",proposal:"Comprehensive engine diagnostic and structural overhaul using OEM parts only. Guaranteed uptime with 24/7 technical relay.",certs:["ISO 9001","IMO"],ports:"Global (400+)",files:"4 Files",validity:"3 Days Left",validityColor:C.error,payment:"30% Adv / 70% Net 30"},
  {logo:"https://lh3.googleusercontent.com/aida-public/AB6AXuDfXX3RwWCKP2tRzwv0Ohu1aDchIQYsHqHmLsE38XcfNO0pVxz8KQJxoljMW1zJERkuSjkDxC9WXMegxYDeq1dWFUz6A5Jd6WZv6pBj-ixr2Svh2Zxu-QeevUXmTQ5FXOnpb6qxNg1vbAAqppVva2pzrUiYHUWdpn5N3BD_V2YwuNBZnPVQnVTjJUpGVbkBgPsgnKhO-sdBi3lzH9pEAPXW5-oT7XEOsKyLlwdI_j8E8qiirIVun8gYyA",badge:"Fastest Timeline",badgeBg:C.secCont,badgeColor:"#95b7e7",name:"Global Marine Eng",price:"$138,900.00",timeline:"9 Days",timelineHi:true,warranty:"12 Months",stars:4,halfStar:false,rating:"4.2",jobs:"850 Ships",response:"45 Mins",proposal:"Rapid response team deployment. Focus on electronic control systems and fuel efficiency optimization. High-speed delivery.",certs:["ISO 14001"],ports:"APAC Region",files:"2 Files",validity:"14 Days Left",validityColor:C.muted,payment:"Net 45"},
  {logo:"https://lh3.googleusercontent.com/aida-public/AB6AXuCRM8ysqG33F0K9oYu_wIkdk_ML7-VxYVGauP1LAVx6RNGWfQoWRUO7lcQoFvKmr7KBClZ6n6ZXN9hrs7zEjDWKBFsAZP02IVwXCebh7cNdAph350BGmi6hJHfNns4pVCXtYoAix3AaNrtQerBeSvegTHqbCnI-3RZSPLdrUayR71bLZ3lQ270MOdJiTVrxbNeARnUj0nnew5gVD0Ng8aNMmnkX7YvmRHfjWPeztoei_n-UnWfP0YPtpg",badge:"Best Value",badgeBg:C.cyanCont,badgeColor:C.cyan,name:"TechVessel Solutions",price:"$131,200.00",timeline:"18 Days",warranty:"36 Months Parts",stars:5,halfStar:false,rating:"5.0",jobs:"412 Ships",response:"6.2 Hours",proposal:"Innovative laser-cleaning tech included. Best balance of technical precision and cost-efficiency. Longest parts warranty in the market.",certs:["ABS Certified","DNV"],ports:"European Hubs",files:"7 Files",validity:"21 Days Left",validityColor:C.muted,payment:"Milestone Based"},
  {logo:"https://lh3.googleusercontent.com/aida-public/AB6AXuD3mZml77I4XVMK-wPr3QraEPRVfbPVGZSwcvkdnZG7rU_FxEQkyDlSjoWkRevXj5ysqOMSm_Dr7faLPClID0hPnN9LNLT7X61rCaUsBfMUNB24xCoYVqEGw2d6gBscXKPA9TLMM2-8DePlP9cWnuwD8M-9q9bIrROQTZMGHbIhp-9FdRTYyy2G6H2uUy23ysT9ghsaMeoqg9BiuqA-l9LBLGxYSGjlGIpuvsZSd1ESba8aVAEQmTh7jQ",badge:"Lowest Price",badgeBg:C.bgBright,badgeColor:C.text,name:"OceanInspect Ltd",price:"$124,000.00",timeline:"25 Days",warranty:"6 Months",stars:3,halfStar:false,rating:"3.8",jobs:"210 Ships",response:"1.5 Days",proposal:"Budget-friendly inspection and basic repair services. Ideal for standard regulatory compliance work. Focus on speed of survey.",certs:["ClassNK"],ports:"Mediterranean Only",files:"1 File",validity:"45 Days Left",validityColor:C.muted,payment:"Full Advance"},
];
const ROWS=["Quoted Price","Timeline","Warranty","Rating","Completed Jobs","Response Time","Proposal Summary","Certifications","Ports Covered","Attachments","Validity","Payment Terms"];
const Stars=({n,half}:{n:number;half?:boolean})=>(<div style={{display:"flex",color:C.cyan}}>{[1,2,3,4,5].map(i=><span key={i} className="material-symbols-outlined" style={{fontSize:"1rem",fontVariationSettings:i<=n?"FILL 1":"FILL 0"}}>{half&&i===n+1?"star_half":"star"}</span>)}</div>);

export const CompareQuotations:React.FC=()=>{
  const navigate=useNavigate();
  const rowH=(i:number)=>i===6?"128px":"64px";

  const [procurement, setProcurement] = useState<any[]>([]);
  useEffect(() => {
    requestsService.getUserRequests().then(res => {
      const mapped = res.data.map((r: any) => ({
        id: r.id,
        name: r.service_type || 'Service Request',
        impa: r.id.substring(0, 6).toUpperCase(),
        cat: r.port || 'Global',
        catColor: C.secondary,
        status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
        statusColor: r.status === 'open' ? C.cyan : (r.status === 'completed' ? C.green : C.dim),
        pulse: r.status === 'open',
        quotes: r.quotes?.length || 0,
      }));
      setProcurement(mapped);
    }).catch(console.error);
  }, []);

  return(
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:"100vh",overflowX:"hidden",paddingBottom:128}}>
      {/* NAV */}
      <header style={{position:"sticky",top:0,zIndex:50,background:"rgba(13,20,29,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",boxShadow:"0 20px 40px rgba(0,209,255,0.08)",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"1rem 2rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:"2rem"}}>
          <span style={{fontFamily:M,fontWeight:900,fontSize:"1.4rem",color:C.primary,letterSpacing:"-0.04em"}}>Horizon</span>
          <nav style={{display:"flex",gap:"1.5rem"}}>
            {[{l:"Fleet Overview",active:false,p:"/ship-owner"},{l:"My Requests",active:true,p:"/compare-quotations"},{l:"My Orders",active:false,p:"/orders"}].map(n=>(
              <a key={n.l} href="#" onClick={e=>{e.preventDefault();navigate(n.p);}} style={{fontFamily:I,fontSize:"0.65rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.1em",color:n.active?C.primary:C.muted,borderBottom:n.active?"2px solid "+C.primary:"none",paddingBottom:n.active?4:0,textDecoration:"none",transition:"color 0.2s"}}>{n.l}</a>
            ))}
          </nav>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
          <div style={{position:"relative",cursor:"pointer"}}><span className="material-symbols-outlined" style={{color:C.muted,fontSize:"1.4rem"}}>notifications</span><span style={{position:"absolute",top:0,right:0,width:8,height:8,background:C.cyan,borderRadius:"50%"}}/></div>
          <span className="material-symbols-outlined" style={{color:C.muted,cursor:"pointer",fontSize:"1.4rem"}}>settings</span>
          <div style={{width:40,height:40,borderRadius:"50%",overflow:"hidden",border:"1px solid rgba(68,71,77,0.4)"}}><img src={PROF} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
        </div>
      </header>
      {/* PAGE HEADER */}
      <main style={{maxWidth:1600,margin:"0 auto",padding:"3rem 2rem"}}>
        <div style={{marginBottom:"3rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"0.5rem"}}>
            <span style={{display:"flex",alignItems:"center",gap:6,background:C.cyanCont,color:C.cyan,padding:"4px 12px",borderRadius:999,fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em"}}>
              <span style={{width:8,height:8,background:C.cyan,borderRadius:"50%"}}/>Live Request
            </span>
            <span style={{color:C.muted,fontSize:"0.875rem"}}>PR-4482 • Engine Overhaul Services</span>
          </div>
          <h1 style={{fontFamily:M,fontWeight:800,fontSize:"clamp(1.75rem,4vw,2.5rem)",letterSpacing:"-0.04em",color:C.text,margin:"0 0 0.5rem"}}>My Requests & Quotations</h1>
          <p style={{color:C.muted,fontSize:"1rem",maxWidth:600,margin:0,lineHeight:1.6}}>Evaluate technical proposals and commercial terms from verified service providers to optimize maritime infrastructure maintenance.</p>
        </div>

        {/* PROCUREMENT OVERVIEW TABLE */}
        <div style={{ background: C.bgLow, borderRadius: 24, overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: "3rem" }}>
          <div style={{ padding: '1.5rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontFamily: M, fontWeight: 700, fontSize: '1rem', color: C.white, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Procurement Overview</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.bgLowest, fontSize: '0.6rem', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                  {['Request','IMPA Code','Category','Status','Quotes','Actions'].map((h, i) => (
                    <th key={h} style={{ padding: '1rem 1.5rem', textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {procurement.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: C.dim }}>
                      No active requests found.
                    </td>
                  </tr>
                ) : procurement.map((row, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}`, transition: 'background 0.2s', cursor: 'pointer' }}
                    onClick={() => navigate(`/request/${row.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: 500, color: C.white }}>{row.name}</td>
                    <td style={{ padding: '1rem 1.5rem', color: C.dim, fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.impa}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(36,72,114,0.3)', color: row.catColor, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' }}>{row.cat}</span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.statusColor }} />
                        <span style={{ color: row.statusColor, fontSize: '0.75rem' }}>{row.status}</span>
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', color: row.quotes ? C.white : C.slate, fontWeight: row.quotes ? 700 : 400 }}>{row.quotes || '0'}</td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, padding: 4, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.cyan)} onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>visibility</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* COMPARISON TABLE */}
        <div style={{overflowX:"auto",paddingBottom:"2rem"}}>
          <div style={{display:"inline-grid",gridTemplateColumns:"280px repeat(4, 320px)",gap:"1rem",minWidth:"max-content"}}>
            {/* LABEL COL */}
            <div style={{display:"flex",flexDirection:"column",gap:0,paddingTop:240}}>
              {ROWS.map((r,i)=>(
                <div key={r} style={{height:rowH(i),display:"flex",alignItems:i===6?"flex-start":"center",padding:i===6?"1rem 1rem 0":"0 1rem",fontSize:"0.65rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.1em",color:C.muted}}>{r}</div>
              ))}
            </div>
            {/* PROVIDER COLS */}
            {PROVIDERS.map((p,pi)=>(
              <div key={p.name} style={{display:"flex",flexDirection:"column",gap:0,transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(156,202,255,0.03)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                {/* HEADER CARD */}
                <div style={{...glass,borderRadius:12,padding:"1.5rem",marginBottom:"1rem",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",height:220,position:"relative",border:"2px solid transparent",transition:"border-color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.borderColor=C.primary)} onMouseLeave={e=>(e.currentTarget.style.borderColor="transparent")}>
                  <div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:p.badgeBg,color:p.badgeColor,padding:"4px 12px",borderRadius:999,fontSize:"0.6rem",fontWeight:900,textTransform:"uppercase",letterSpacing:"0.1em",whiteSpace:"nowrap",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>{p.badge}</div>
                  <img src={p.logo} alt={p.name} style={{width:64,height:64,borderRadius:8,objectFit:"cover",background:C.bgHigh,padding:8,marginBottom:"1rem"}}/>
                  <h3 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.text,margin:"0 0 auto"}}>{p.name}</h3>
                  <div style={{display:"flex",gap:"0.5rem"}}>
                    <button style={{padding:"0.4rem",borderRadius:8,background:C.bgCardH,border:"none",cursor:"pointer",color:C.muted,display:"flex",transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.primary)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}><span className="material-symbols-outlined" style={{fontSize:"1rem"}}>visibility</span></button>
                    <button style={{padding:"0.4rem 1rem",borderRadius:8,background:C.primary,color:"#003256",fontWeight:700,fontSize:"0.65rem",textTransform:"uppercase",letterSpacing:"0.1em",border:"none",cursor:"pointer",transition:"box-shadow 0.2s",boxShadow:"none"}} onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 0 20px rgba(76,214,255,0.15)")} onMouseLeave={e=>(e.currentTarget.style.boxShadow="none")}>Award</button>
                    <button style={{padding:"0.4rem",borderRadius:8,background:C.bgCardH,border:"none",cursor:"pointer",color:C.muted,display:"flex",transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.error)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}><span className="material-symbols-outlined" style={{fontSize:"1rem"}}>close</span></button>
                  </div>
                </div>
                {/* DATA ROWS */}
                {[
                  <span style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.primary}}>{p.price}</span>,
                  <span style={{color:p.timelineHi?C.cyan:C.text,fontWeight:p.timelineHi?700:400}}>{p.timeline}</span>,
                  <span>{p.warranty}</span>,
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}><Stars n={p.stars} half={p.halfStar}/><span style={{fontWeight:700,marginLeft:4}}>{p.rating}</span></div>,
                  <span>{p.jobs}</span>,
                  <span>{p.response}</span>,
                  <span style={{fontSize:"0.8rem",color:C.muted,lineHeight:1.5}}>{p.proposal}</span>,
                  <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem"}}>{p.certs.map(c=><span key={c} style={{background:"rgba(68,71,77,0.2)",padding:"3px 8px",borderRadius:4,fontSize:"0.6rem",textTransform:"uppercase"}}>{c}</span>)}</div>,
                  <span>{p.ports}</span>,
                  <div style={{display:"flex",alignItems:"center",gap:6,color:C.primary}}><span className="material-symbols-outlined" style={{fontSize:"1rem"}}>description</span>{p.files}</div>,
                  <span style={{color:p.validityColor,fontWeight:p.validityColor===C.error?700:400}}>{p.validity}</span>,
                  <span style={{fontSize:"0.8rem"}}>{p.payment}</span>,
                ].map((content,ri)=>(
                  <div key={ri} style={{height:rowH(ri),background:ri%2===0?"rgba(21,28,38,0.5)":"rgba(21,28,38,0.3)",display:"flex",alignItems:ri===6?"flex-start":"center",padding:ri===6?"1rem 1.5rem 0":"0 1.5rem"}}>{content}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
        {/* SUMMARY CARDS */}
        <section style={{marginTop:"3rem",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1.5rem"}}>
          {[{icon:"analytics",iconColor:C.primary,iconBg:C.primCont,border:C.primary,title:"Cost Variance",sub:"Across 4 Bidders",val:"$18,500.00",desc:"Maximum difference between highest and lowest bids detected."},
            {icon:"shutter_speed",iconColor:C.cyan,iconBg:C.cyanCont,border:C.cyan,title:"Average Timeline",sub:"Efficiency Metric",val:"16.5 Days",desc:"Competitive average based on current shipyard availability."},
            {icon:"verified_user",iconColor:C.secondary,iconBg:C.secCont,border:C.secondary,title:"Trust Score",sub:"Verified History",val:"A+ Rated",desc:"All 4 providers have passed Horizon rigorous technical audit."}
          ].map(s=>(
            <div key={s.title} style={{...glass,padding:"1.5rem",borderRadius:16,borderLeft:"4px solid "+s.border}}>
              <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1rem"}}>
                <span className="material-symbols-outlined" style={{color:s.iconColor,background:s.iconBg,padding:"0.75rem",borderRadius:12,fontSize:"1.4rem"}}>{s.icon}</span>
                <div><h4 style={{fontFamily:M,fontWeight:700,color:C.text,margin:0,fontSize:"0.95rem"}}>{s.title}</h4><p style={{fontSize:"0.6rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.12em",margin:0}}>{s.sub}</p></div>
              </div>
              <div style={{fontFamily:M,fontWeight:900,fontSize:"2rem",color:C.text,margin:"0 0 0.5rem"}}>{s.val}</div>
              <p style={{fontSize:"0.875rem",color:C.muted,margin:0}}>{s.desc}</p>
            </div>
          ))}
        </section>
      </main>
      {/* FOOTER */}
      <footer style={{position:"fixed",bottom:0,left:0,right:0,zIndex:60,background:"rgba(36,42,52,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",padding:"1.25rem 2rem",boxShadow:"0 -10px 40px rgba(0,0,0,0.4)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:"1.5rem"}}>
          <button onClick={()=>navigate(-1)} style={{display:"flex",alignItems:"center",gap:"0.5rem",background:"none",border:"none",cursor:"pointer",color:C.muted,fontWeight:700,fontSize:"0.875rem",textTransform:"uppercase",letterSpacing:"0.1em",transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.text)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>
            <span className="material-symbols-outlined">arrow_back</span>Back to Quotations
          </button>
          <div style={{width:1,height:32,background:"rgba(68,71,77,0.3)"}}/>
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.875rem"}}>
            <span style={{color:C.muted}}>Selected for Award:</span>
            <span style={{fontFamily:M,fontWeight:700,color:C.primary}}>TechVessel Solutions</span>
          </div>
        </div>
        <div style={{display:"flex",gap:"1rem"}}>
          <button style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.75rem 1.5rem",borderRadius:10,background:C.bgHigh,color:C.text,fontWeight:700,fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.1em",border:"none",cursor:"pointer",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgBright)} onMouseLeave={e=>(e.currentTarget.style.background=C.bgHigh)}>
            <span className="material-symbols-outlined" style={{fontSize:"1rem"}}>picture_as_pdf</span>Export Comparison
          </button>
          <button style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.75rem 2rem",borderRadius:10,background:C.primary,color:"#003256",fontWeight:900,fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.1em",border:"none",cursor:"pointer",boxShadow:"0 0 30px rgba(156,202,255,0.3)"}}>
            Award Contract <span className="material-symbols-outlined" style={{fontSize:"1rem"}}>gavel</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
export default CompareQuotations;
