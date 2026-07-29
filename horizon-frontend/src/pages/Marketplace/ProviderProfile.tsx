import React from "react";
import { useParams, useNavigate } from "react-router-dom";

const C={bg:"#0d141d",bgCard:"#19202a",bgCardH:"#242a34",bgHigh:"#2e353f",bgBright:"#333a44",bgLowest:"#080f18",bgLow:"#151c26",border:"rgba(68,71,77,0.1)",borderV:"rgba(68,71,77,0.15)",text:"#dce3f0",muted:"#c4c6ce",dim:"#8e9098",cyan:"#4cd6ff",cyanCont:"#00222c",primary:"#9ccaff",primCont:"#00203a",secondary:"#a6c9fa",error:"#ffb4ab",white:"#ffffff"};
const M="Manrope,sans-serif",I="Inter,sans-serif";
const glass:React.CSSProperties={background:"rgba(46,53,63,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"};
const PROF="https://lh3.googleusercontent.com/aida-public/AB6AXuDxdalixV7Y51mhajJmYkezIAg6wv3JwtnEacAA3QJeGkGWXAYyhiki1jMY-puMwxX3aAqrU_fX0HWPGTx5DHJtuQFSEk7m4JOF3xNDClOx2S217LGNx4T5kUC1D5-gi7gUcwMBgf-nj26CjJ0vdHvCbNe8SW20LOZcXEeOx98EHYjTxryO_xAVtUqCD_esASz1ZgWKCVlaVyBQgYwAdnkzsNRoAEoiM0g2o-S445_C9ndZ8guCfJBvF3eD8JwTXDsAgOTZhcOE7g2G";
const HERO="https://lh3.googleusercontent.com/aida-public/AB6AXuCdZGbSZ0k5MhOyO3d2aUOgDFFUCsJ_XbK8N3wov_EXZ--hXQS-Dy0QnYTwj8bmW0OGmezyIUm9jjyTt-5eAO_DO-1MzaQdnNHmxXpgPzOMjj074P5YHBXFJO8FIKMAp4o_YaXC6DMXPNg4TL7FPZ47tJHTSlgGfD4IeTtkpfQe3GhNHpz8XHhLqpULZIRtHefd7otvisH1mEOTymatBRp1Z9lZXo4rS1CguA2spFjHuKo2ydG_TiC5_JvT2Gis6v55ttwyzis1cNk9";
const MAP="https://lh3.googleusercontent.com/aida-public/AB6AXuDgaA3jkrpWZ485GYstlFqBOYML0MzO4MUkXVa1Tz_eC4NZUFT2LQrupMiuP6gQIDp4aqwmbUGvfksrqETQOG7qC3Kv6RmJat2zzCwOgfkXi6S8hoe_koIL7AQdRxNJfKyUs94EdkCQRWzR7yWz5bYkpOMfVckd9uWUVBACRyQcImyQLK9Hyv7aJ4NOzLdZxh2jz5nxAvE3J9yk7kDHKG55IIOtVZIVDlHnLIuonA1IOM86v9ykoDLu8UBLlMGjLfF3sjv2Us3T3lm_";
const EXPERTISE=[{icon:"precision_manufacturing",title:"Heavy Welding",desc:"Specialized sub-sea and hull structural repairs using advanced alloy techniques."},{icon:"bolt",title:"Electrical",desc:"Full system diagnostics, bridge electronics, and power distribution maintenance."},{icon:"settings_input_component",title:"Engine Systems",desc:"Overhaul and precision tuning for Tier III diesel engines and propulsion units."}];
const SERVICES=["Electrical Repairs","Engine Overhaul","Hydraulic Repairs","Hull Cleaning","Fire Safety Inspection","Crane Maintenance","Refrigeration Repairs"];
const CERTS=[{icon:"verified_user",title:"ISO 9001:2015",sub:"Quality Management"},{icon:"anchor",title:"Lloyds Register",sub:"Class Approval"},{icon:"security",title:"DNV GL",sub:"Safety Certified"}];
const REVIEWS=[{company:"Maersk Line",vessel:"Maersk Tianjin",date:"Oct 2023",text:"Exceptional response time for our engine failure in the North Sea. The engineering team arrived via chopper within 4 hours and had us operational before sunrise. Highly professional."},{company:"Hapag-Lloyd",vessel:"Berlin Express",date:"Aug 2023",text:"Reliable welding work on structural stress cracks. The Lloyd certification was handled seamlessly by the provider."}];
const STATS=[{l:"Operational Span",v:"15 Years"},{l:"Success Rate",v:"99.2%"},{l:"Jobs Fulfilled",v:"450+"},{l:"Avg. Quote Response",v:"1.8 Hours"},{l:"Avg. Completion",v:"5 Days"}];
const TEAM_STATS=[{v:"150+",l:"Marine Engineers"},{v:"40",l:"Certified Techs"},{v:"12",l:"Global Ports"},{v:"24/7",l:"Emergency Teams"}];
export const ProviderProfile:React.FC=()=>{
  const {id}=useParams<{id:string}>();
  const navigate=useNavigate();
  return(
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:"100vh",paddingBottom:120}}>
      {/* TOP NAV */}
      <nav style={{position:"sticky",top:0,zIndex:50,background:"rgba(15,23,36,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 2rem",height:80,boxShadow:"0 20px 40px rgba(0,209,255,0.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"2rem"}}>
          <span style={{fontFamily:M,fontWeight:900,fontSize:"1.4rem",color:C.white,letterSpacing:"-0.04em"}}>HORIZON</span>
          <nav style={{display:"flex",gap:"1.5rem"}}>
            {[{l:"Marketplace",p:"/marketplace"},{l:"Vessels",p:"/ship-owner",active:true},{l:"Contracts",p:"/ship-owner"},{l:"Logistics",p:"/ship-owner"}].map(n=>(
              <a key={n.l} href="#" onClick={e=>{e.preventDefault();navigate(n.p);}} style={{color:n.active?C.cyan:"#94a3b8",fontWeight:500,fontSize:"0.875rem",textDecoration:"none",borderBottom:n.active?"2px solid "+C.cyan:"none",paddingBottom:n.active?4:0,transition:"color 0.2s"}}>{n.l}</a>
            ))}
          </nav>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
          {["notifications","anchor"].map(icon=><button key={icon} style={{padding:"0.5rem",background:"rgba(255,255,255,0.05)",borderRadius:"50%",border:"none",cursor:"pointer",display:"flex",color:C.muted,transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.1)")} onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,0.05)")}><span className="material-symbols-outlined">{icon}</span></button>)}
          <div style={{width:40,height:40,borderRadius:"50%",overflow:"hidden",marginLeft:8,border:"1px solid rgba(68,71,77,0.3)"}}><img src={PROF} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{position:"relative",width:"100%",height:400,display:"flex",alignItems:"flex-end",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#0d141d,rgba(13,20,29,0.4),transparent)",zIndex:1}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to right,#0d141d,transparent,transparent)",zIndex:1}}/>
        <img src={HERO} alt="Shipyard" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
        <div style={{position:"relative",zIndex:2,padding:"0 4rem 3rem",width:"100%",maxWidth:1280,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1rem"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:C.cyanCont,border:"1px solid rgba(76,214,255,0.2)",borderRadius:999,color:C.cyan,fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em"}}>
              <span className="material-symbols-outlined" style={{fontSize:"1rem",fontVariationSettings:"FILL 1"}}>verified</span>Titanium Verified
            </div>
            <span style={{width:8,height:8,background:C.cyan,borderRadius:"50%",display:"inline-block"}}/>
            <span style={{fontSize:"0.65rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.2em",color:C.muted}}>Available for Dispatch</span>
          </div>
          <h1 style={{fontFamily:M,fontWeight:800,fontSize:"clamp(2.5rem,6vw,4.5rem)",color:C.white,letterSpacing:"-0.04em",lineHeight:0.9,margin:"0 0 2rem"}}>North Sea <br/><span style={{color:C.primary}}>Maritime Repairs</span></h1>
          <div style={{display:"flex",flexWrap:"wrap",gap:"3rem"}}>
            {STATS.map(s=>(
              <div key={s.l} style={{display:"flex",flexDirection:"column"}}>
                <span style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.2em",color:C.muted,marginBottom:4}}>{s.l}</span>
                <span style={{fontFamily:M,fontWeight:700,fontSize:"2rem",color:C.text}}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* CONTENT GRID */}
      <div style={{maxWidth:1280,margin:"0 auto",padding:"4rem 4rem 0",display:"grid",gridTemplateColumns:"1fr 360px",gap:"3rem",alignItems:"start"}}>
        {/* LEFT */}
        <div style={{display:"flex",flexDirection:"column",gap:"4rem"}}>
          {/* Company Overview */}
          <section>
            <span style={{fontSize:"0.6rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.2em",color:C.muted,display:"block",marginBottom:8}}>About Company</span>
            <h2 style={{fontFamily:M,fontWeight:800,fontSize:"2rem",color:C.white,margin:"0 0 1rem"}}>Company Overview</h2>
            <p style={{color:C.muted,lineHeight:1.8,maxWidth:720,margin:"0 0 2rem"}}>With over 15 years of specialization in marine engineering, North Sea Maritime Repairs has established itself as a premier provider across Europe. We deliver high-precision technical solutions for the most demanding maritime environments, ensuring vessel uptime and safety through rigorous engineering standards.</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"1rem"}}>
              {TEAM_STATS.map(s=>(
                <div key={s.l} style={{background:C.bgLow,padding:"1.5rem",borderRadius:12,border:"1px solid rgba(68,71,77,0.1)"}}>
                  <p style={{fontFamily:M,fontWeight:700,fontSize:"1.5rem",color:C.primary,margin:"0 0 4px"}}>{s.v}</p>
                  <p style={{fontSize:"0.65rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:0}}>{s.l}</p>
                </div>
              ))}
            </div>
          </section>
          {/* Expertise */}
          <section>
            <span style={{fontSize:"0.6rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.2em",color:C.muted,display:"block",marginBottom:8}}>Core Competencies</span>
            <h2 style={{fontFamily:M,fontWeight:800,fontSize:"2rem",color:C.white,margin:"0 0 1.5rem"}}>Our Expertise</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1.5rem"}}>
              {EXPERTISE.map(e=>(
                <div key={e.title} style={{background:C.bgCardH,padding:"2rem",borderRadius:12,display:"flex",flexDirection:"column",justifyContent:"space-between",height:240,transition:"background 0.3s",cursor:"default"}} onMouseEnter={e2=>(e2.currentTarget.style.background=C.bgBright)} onMouseLeave={e2=>(e2.currentTarget.style.background=C.bgCardH)}>
                  <span className="material-symbols-outlined" style={{fontSize:"2.5rem",color:C.primary}}>{e.icon}</span>
                  <div><h3 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.white,margin:"0 0 0.5rem"}}>{e.title}</h3><p style={{fontSize:"0.875rem",color:C.muted,lineHeight:1.5,margin:0}}>{e.desc}</p></div>
                </div>
              ))}
            </div>
          </section>
          {/* Services */}
          <section>
            <span style={{fontSize:"0.6rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.2em",color:C.muted,display:"block",marginBottom:8}}>Capabilities</span>
            <h2 style={{fontFamily:M,fontWeight:800,fontSize:"2rem",color:C.white,margin:"0 0 1.5rem"}}>Services Offered</h2>
            <div style={{display:"flex",flexWrap:"wrap",gap:"0.75rem"}}>
              {SERVICES.map(s=><span key={s} style={{padding:"8px 16px",background:C.bgHigh,color:C.text,borderRadius:999,fontSize:"0.875rem",border:"1px solid rgba(68,71,77,0.2)"}}>{s}</span>)}
              <a href="#" style={{padding:"8px 16px",color:C.primary,fontSize:"0.875rem",fontWeight:700,textDecoration:"none"}}>+18 More</a>
            </div>
          </section>
          {/* Certifications */}
          <section>
            <span style={{fontSize:"0.6rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.2em",color:C.muted,display:"block",marginBottom:8}}>Global Standards</span>
            <h2 style={{fontFamily:M,fontWeight:800,fontSize:"2rem",color:C.white,margin:"0 0 1.5rem"}}>Certifications</h2>
            <div style={{display:"flex",flexWrap:"wrap",gap:"1rem"}}>
              {CERTS.map(c=>(
                <div key={c.title} style={{...glass,padding:"1.5rem 2rem",borderRadius:12,border:"1px solid rgba(68,71,77,0.15)",display:"flex",alignItems:"center",gap:"1.5rem",flex:1,minWidth:260}}>
                  <div style={{width:64,height:64,background:"rgba(255,255,255,0.05)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span className="material-symbols-outlined" style={{fontSize:"2rem",color:C.primary}}>{c.icon}</span>
                  </div>
                  <div><h4 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.white,margin:"0 0 4px"}}>{c.title}</h4><p style={{fontSize:"0.65rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.12em",margin:0}}>{c.sub}</p></div>
                </div>
              ))}
            </div>
          </section>
          {/* Reviews */}
          <section>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"2rem",flexWrap:"wrap",gap:"1rem"}}>
              <div><span style={{fontSize:"0.6rem",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.2em",color:C.muted,display:"block",marginBottom:8}}>Market Reputation</span><h2 style={{fontFamily:M,fontWeight:800,fontSize:"2rem",color:C.white,margin:0}}>Ratings & Reviews</h2></div>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
                <span style={{fontFamily:M,fontWeight:700,fontSize:"2.5rem",color:C.primary}}>4.9</span>
                <div style={{display:"flex",color:C.primary}}>{[1,2,3,4].map(i=><span key={i} className="material-symbols-outlined" style={{fontVariationSettings:"FILL 1"}}>star</span>)}<span className="material-symbols-outlined" style={{fontVariationSettings:"FILL 1"}}>star_half</span></div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
              {REVIEWS.map(r=>(
                <div key={r.company} style={{background:C.bgLow,padding:"2rem",borderRadius:12,borderBottom:"2px solid transparent",transition:"border-color 0.3s"}} onMouseEnter={e=>(e.currentTarget.style.borderBottomColor="rgba(156,202,255,0.3)")} onMouseLeave={e=>(e.currentTarget.style.borderBottomColor="transparent")}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1rem",flexWrap:"wrap",gap:"0.5rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
                      <div style={{width:48,height:48,borderRadius:8,background:C.bgHigh,display:"flex",alignItems:"center",justifyContent:"center"}}><span className="material-symbols-outlined" style={{color:C.muted}}>directions_boat</span></div>
                      <div><h4 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.white,margin:0}}>{r.company}</h4><p style={{fontSize:"0.65rem",color:C.muted,margin:0}}>Vessel: {r.vessel}</p></div>
                    </div>
                    <span style={{fontSize:"0.65rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em"}}>{r.date}</span>
                  </div>
                  <p style={{color:C.muted,fontStyle:"italic",lineHeight:1.7,margin:0}}>&ldquo;{r.text}&rdquo;</p>
                </div>
              ))}
            </div>
          </section>
          {/* Ports & Vessels */}
          <section style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3rem",paddingBottom:"2rem"}}>
            <div>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:"1.2rem",color:C.white,margin:"0 0 1rem"}}>Ports Covered</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",color:C.muted,fontSize:"0.875rem"}}>
                {["Bergen","Rotterdam","Hamburg","Antwerp","Singapore","Dubai"].map(p=><span key={p}>• {p}</span>)}
                <span style={{color:C.primary,fontWeight:700}}>+12 Ports</span>
              </div>
            </div>
            <div>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:"1.2rem",color:C.white,margin:"0 0 1rem"}}>Supported Vessels</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",color:C.muted,fontSize:"0.875rem"}}>
                {["Container Ships","Tankers","Bulk Carriers","LNG","Passenger Ships","Offshore Vessels"].map(v=><span key={v}>• {v}</span>)}
              </div>
            </div>
          </section>
        </div>
        {/* RIGHT SIDEBAR */}
        <aside style={{position:"sticky",top:96,display:"flex",flexDirection:"column",gap:"2rem"}}>
          <div style={{background:C.bgHigh,padding:"2rem",borderRadius:16,border:"1px solid rgba(68,71,77,0.2)",boxShadow:"0 20px 40px rgba(0,0,0,0.3)"}}>
            <h3 style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:C.white,margin:"0 0 1.5rem"}}>Provider Info</h3>
            <ul style={{listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:"1.5rem"}}>
              {[{icon:"location_on",title:"Bergen, Norway",sub:"Primary Hub & Workshops"},{icon:"language",title:"Multilingual Support",sub:"English, Norwegian, German"},{icon:"support_agent",title:"24/7 Rapid Response",sub:"Aviation-ready engineering team"}].map(item=>(
                <li key={item.title} style={{display:"flex",alignItems:"flex-start",gap:"1rem"}}>
                  <span className="material-symbols-outlined" style={{color:C.primary,flexShrink:0,marginTop:2}}>{item.icon}</span>
                  <div><p style={{fontWeight:600,color:C.text,margin:"0 0 2px"}}>{item.title}</p><p style={{fontSize:"0.75rem",color:C.muted,margin:0}}>{item.sub}</p></div>
                </li>
              ))}
            </ul>
            <div style={{marginTop:"2.5rem",paddingTop:"2.5rem",borderTop:"1px solid rgba(68,71,77,0.3)"}}>
              <p style={{fontSize:"0.6rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.15em",margin:"0 0 0.75rem"}}>Estimated Response</p>
              <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                <span className="material-symbols-outlined" style={{color:C.cyan}}>bolt</span>
                <span style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:C.white}}>&lt; 120 Minutes</span>
              </div>
            </div>
          </div>
          <div style={{width:"100%",height:192,borderRadius:12,overflow:"hidden",position:"relative"}}>
            <img src={MAP} alt="Location Map" style={{width:"100%",height:"100%",objectFit:"cover",filter:"grayscale(1)",opacity:0.5}}/>
            <div style={{position:"absolute",inset:0,background:"rgba(156,202,255,0.1)",mixBlendMode:"overlay"}}/>
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)"}}>
              <div style={{width:16,height:16,background:C.primary,borderRadius:"50%",position:"absolute",inset:0,opacity:0.5}}/>
              <div style={{width:16,height:16,background:C.primary,borderRadius:"50%",boxShadow:"0 0 20px rgba(156,202,255,0.8)",position:"relative"}}/>
            </div>
          </div>
        </aside>
      </div>
      {/* STICKY BOTTOM BAR */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,padding:"1.5rem",display:"flex",justifyContent:"center",pointerEvents:"none"}}>
        <div style={{maxWidth:800,width:"100%",...glass,padding:"1rem 1.5rem",borderRadius:999,border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 -20px 40px rgba(0,0,0,0.4)",display:"flex",justifyContent:"space-between",alignItems:"center",pointerEvents:"auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:"1.5rem",paddingLeft:"0.5rem"}}>
            <div style={{display:"flex",gap:"1rem"}}>
              {[{icon:"download",l:"PDF"},{icon:"bookmark",l:"Save"},{icon:"share",l:"Share"}].map(b=>(
                <button key={b.l} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",color:C.muted,transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.primary)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>
                  <span className="material-symbols-outlined" style={{fontSize:"1.2rem"}}>{b.icon}</span>
                  <span style={{fontSize:"0.55rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>{b.l}</span>
                </button>
              ))}
            </div>
            <div style={{width:1,height:32,background:"rgba(255,255,255,0.1)"}}/>
            <div>
              <p style={{fontSize:"0.55rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.15em",margin:"0 0 2px"}}>Primary Contact</p>
              <p style={{fontFamily:M,fontWeight:700,fontSize:"0.9rem",color:C.white,margin:0}}>Capt. Erik Sorensen</p>
            </div>
          </div>
          {id === 'me' ? (
            <div style={{display:"flex",gap:"0.75rem"}}>
              <button onClick={()=>navigate("/profile/edit")} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.75rem 2rem",background:"linear-gradient(to right,#9ccaff,#a6c9fa)",color:"#003256",fontFamily:M,fontWeight:900,fontSize:"0.875rem",border:"none",borderRadius:999,cursor:"pointer",boxShadow:"0 0 30px rgba(156,202,255,0.4)",transition:"box-shadow 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 0 40px rgba(156,202,255,0.6)")} onMouseLeave={e=>(e.currentTarget.style.boxShadow="0 0 30px rgba(156,202,255,0.4)")}>
                Edit Profile <span className="material-symbols-outlined" style={{fontSize:"1.1rem"}}>edit</span>
              </button>
            </div>
          ) : (
            <div style={{display:"flex",gap:"0.75rem"}}>
              <button style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.75rem 1.5rem",background:C.bgHigh,color:C.white,fontFamily:M,fontWeight:700,fontSize:"0.875rem",border:"none",borderRadius:999,cursor:"pointer",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgBright)} onMouseLeave={e=>(e.currentTarget.style.background=C.bgHigh)}>
                <span className="material-symbols-outlined" style={{fontSize:"1.1rem"}}>chat</span>Message Provider
              </button>
              <button onClick={()=>navigate("/create-request")} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.75rem 2rem",background:"linear-gradient(to right,#9ccaff,#a6c9fa)",color:"#003256",fontFamily:M,fontWeight:900,fontSize:"0.875rem",border:"none",borderRadius:999,cursor:"pointer",boxShadow:"0 0 30px rgba(156,202,255,0.4)",transition:"box-shadow 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 0 40px rgba(156,202,255,0.6)")} onMouseLeave={e=>(e.currentTarget.style.boxShadow="0 0 30px rgba(156,202,255,0.4)")}>
                Request Service <span className="material-symbols-outlined" style={{fontSize:"1.1rem"}}>arrow_forward</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default ProviderProfile;
