import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const C={bg:"#0d141d",bgCard:"#19202a",bgCardH:"#242a34",bgHigh:"#2e353f",bgBright:"#333a44",bgLowest:"#080f18",bgLow:"#151c26",border:"rgba(68,71,77,0.1)",borderV:"rgba(255,255,255,0.05)",text:"#dce3f0",muted:"#c4c6ce",dim:"#8e9098",cyan:"#4cd6ff",cyanCont:"#00222c",primary:"#9ccaff",primCont:"#00203a",secondary:"#a6c9fa",secCont:"#244872",error:"#ffb4ab",errCont:"#93000a",white:"#ffffff"};
const M="Manrope,sans-serif",I="Inter,sans-serif";
const glass:React.CSSProperties={background:"rgba(46,53,63,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"};
const glow:React.CSSProperties={boxShadow:"0 20px 40px rgba(0,209,255,0.08)"};
const PROF="https://lh3.googleusercontent.com/aida-public/AB6AXuAVBfWsFcrVA0awiqMrYb8Jnc0ud9m43QLMRZE9N4j-2JpLB0_1G93uK1RaXDLlvl4MK4_XnPDd09Ib0Fi00MSSMgZss5SS5HIPJn0vWTl3KeFtRN4RQCUFqdYd58D7RUitm9DVO9OCvOYlQdpyCLxagFnJzpI8Qu9hp7PXctnhZP87Yg0Y1dELP2CoSwzRkl365uXPKdw7XcAtTJZB7p70iAYy6v6zItqpev1bYZrkLbSHH5sQ-eFCoQ";
const MAP="https://lh3.googleusercontent.com/aida-public/AB6AXuDc4wEr1xuSm6Paii2vuBYglSomNH3NcxYWDKVqoXEQCLK-AXBrA8Gl9tWkTWAKtZqdDSEnFW5kPl-VzEH-sBAqZiKAxkIzkPKswvVKD1SCPTIhTU4OJk3dOwlu58SpQhtSxuEV5hGK4U3JHh6Z4R-8fQhMuIsd7gX-q9HGVNqBExIgMeAiODQO1Nqd-C9sMvuDqlff54pNhkkxDPl7v3lX2BCF1qvFOMa9vfR3R9Jpvr0cMXFoFOMjQg";
const NAV=[{icon:"dashboard",l:"Dashboard",p:"/ship-owner"},{icon:"storefront",l:"Marketplace",p:"/marketplace"},{icon:"shopping_cart",l:"Procurement",p:"/procurement-opportunities"},{icon:"notifications",l:"Notifications",p:"/notifications",active:true},{icon:"monitoring",l:"Analytics",p:"/analytics"}];
const FILTERS=["All","Unread (12)","High Priority","Procurement","Quotations","Jobs","Payments","System"];
const TABS=["All Notifications","Action Required","Updates","System","Archived"];
const KPI=[{l:"Unread",v:"12",vc:C.primary,sub:"Live Syncing",subC:C.cyan,pulse:true},{l:"Today",v:"24",vc:C.text,sub:"+4 from yesterday",subC:C.muted},{l:"High Priority",v:"3",vc:C.error,sub:"Requires immediate action",subC:"rgba(255,180,171,0.6)",border:C.error},{l:"Completed",v:"158",vc:C.secondary,sub:"Last 30 days",subC:C.muted}];
export const NotificationsPage:React.FC=()=>{
  const navigate=useNavigate();
  const [activeFilter,setActiveFilter]=useState("All");
  const [activeTab,setActiveTab]=useState("All Notifications");
  return(
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:"100vh",display:"flex",overflowX:"hidden"}}>
      {/* SIDE NAV */}
      <aside style={{width:256,flexShrink:0,position:"fixed",left:0,top:0,bottom:0,background:C.bgLow,display:"flex",flexDirection:"column",paddingTop:"2rem",zIndex:60}}>
        <div style={{padding:"0 1.5rem",marginBottom:"2.5rem",display:"flex",alignItems:"center",gap:"0.75rem"}}>
          <div style={{width:32,height:32,background:C.primary,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}><span className="material-symbols-outlined" style={{color:"#001d35",fontSize:"1.2rem",fontVariationSettings:"FILL 1"}}>sailing</span></div>
          <div><h1 style={{fontFamily:M,fontWeight:900,fontSize:"1.4rem",color:C.primary,letterSpacing:"-0.04em",margin:0}}>Horizon</h1><p style={{fontSize:"0.55rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.2em",margin:0,opacity:0.6}}>Maritime B2B</p></div>
        </div>
        <nav style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
          {NAV.map(item=>(
            <a key={item.l} href="#" onClick={e=>{e.preventDefault();navigate(item.p);}}
              style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"1rem 1.5rem",textDecoration:"none",color:item.active?C.primary:C.muted,background:item.active?"rgba(156,202,255,0.05)":"transparent",borderLeft:item.active?"4px solid "+C.primary:"4px solid transparent",fontWeight:item.active?700:400,transition:"all 0.2s"}}
              onMouseEnter={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background=C.bgCardH;(e.currentTarget as HTMLElement).style.color=C.text;}}}
              onMouseLeave={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background="transparent";(e.currentTarget as HTMLElement).style.color=C.muted;}}}>
              <span className="material-symbols-outlined" style={{fontVariationSettings:item.active?"FILL 1":"FILL 0"}}>{item.icon}</span>
              <span style={{fontSize:"0.65rem",textTransform:"uppercase",letterSpacing:"0.12em"}}>{item.l}</span>
            </a>
          ))}
        </nav>
        <div style={{padding:"1rem 1.5rem"}}>
          <button onClick={()=>navigate("/create-request")} style={{width:"100%",background:C.primary,color:"#003256",fontWeight:700,padding:"0.75rem",borderRadius:12,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem",boxShadow:"0 8px 20px rgba(156,202,255,0.1)"}}>
            <span className="material-symbols-outlined">add</span>New Manifest
          </button>
          <div style={{marginTop:"1.5rem",paddingTop:"1.5rem",borderTop:"1px solid rgba(68,71,77,0.1)",display:"flex",flexDirection:"column",gap:"0.25rem"}}>
            {[{icon:"help",l:"Support"},{icon:"settings",l:"Settings"}].map(s=>(
              <a key={s.l} href="#" style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.5rem 0",color:C.muted,textDecoration:"none",fontSize:"0.75rem",transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.text)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>
                <span className="material-symbols-outlined" style={{fontSize:"1.1rem"}}>{s.icon}</span>{s.l}
              </a>
            ))}
          </div>
        </div>
      </aside>
      {/* TOP NAV */}
      <header style={{position:"fixed",top:0,left:256,right:0,height:64,zIndex:50,background:"rgba(13,20,29,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 2rem",...glow}}>
        <div style={{display:"flex",alignItems:"center",gap:"2rem"}}>
          <div style={{position:"relative"}}><span className="material-symbols-outlined" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:"1.1rem",color:C.muted,pointerEvents:"none"}}>search</span><input type="text" placeholder="Search fleet or orders..." style={{background:C.bgLowest,border:"none",borderBottom:"2px solid rgba(68,71,77,0.2)",borderRadius:"8px 8px 0 0",padding:"6px 14px 6px 36px",fontSize:"0.875rem",color:C.text,fontFamily:I,outline:"none",width:256,transition:"border-color 0.2s"}} onFocus={e=>(e.currentTarget.style.borderBottomColor=C.cyan)} onBlur={e=>(e.currentTarget.style.borderBottomColor="rgba(68,71,77,0.2)")}/></div>
          <nav style={{display:"flex",gap:"1.5rem"}}>
            {["Global Fleet","Ports","Terminals"].map(l=>(
              <a key={l} href="#" style={{fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",color:C.muted,textDecoration:"none",transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.text)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>{l}</a>
            ))}
          </nav>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"1.5rem"}}>
          <button style={{padding:"4px 14px",background:C.secCont,color:"#95b7e7",fontSize:"0.75rem",fontWeight:700,borderRadius:8,border:"none",cursor:"pointer"}}>Create Order</button>
          <button style={{background:"none",border:"none",cursor:"pointer",color:C.muted,display:"flex",transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.text)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}><span className="material-symbols-outlined">apps</span></button>
          <div style={{width:32,height:32,borderRadius:"50%",overflow:"hidden",border:"1px solid rgba(68,71,77,0.3)"}}><img src={PROF} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
        </div>
      </header>

      {/* MAIN */}
      <main style={{marginLeft:256,paddingTop:64,flex:1,background:C.bg}}>
        <div style={{padding:"2rem",maxWidth:1400,margin:"0 auto",display:"flex",gap:"2rem"}}>
          {/* LEFT */}
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:"2rem"}}>
            {/* Header */}
            <section style={{display:"flex",flexDirection:"column",gap:"1.5rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:"1rem"}}>
                <div>
                  <span style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.2em",color:C.muted,display:"block",marginBottom:4}}>Activity Hub</span>
                  <h2 style={{fontFamily:M,fontWeight:700,fontSize:"clamp(1.75rem,4vw,2.5rem)",letterSpacing:"-0.03em",color:C.text,margin:"0 0 0.5rem"}}>Notifications</h2>
                  <p style={{color:C.muted,fontSize:"1rem",margin:0,maxWidth:500}}>Stay updated with your procurement activities, quotations, jobs and account updates across the maritime network.</p>
                </div>
                <div style={{display:"flex",gap:"0.5rem"}}>
                  <button style={{padding:"0.5rem 1rem",background:"none",border:"none",cursor:"pointer",fontSize:"0.75rem",fontWeight:700,color:C.muted,transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.text)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>Mark All as Read</button>
                  {["settings","delete_sweep"].map(icon=>(
                    <button key={icon} style={{padding:"0.5rem",background:"none",border:"none",cursor:"pointer",color:icon==="delete_sweep"?"rgba(255,180,171,0.8)":C.muted,display:"flex",borderRadius:8,transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgCardH)} onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                      <span className="material-symbols-outlined">{icon}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* KPI */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"1rem"}}>
                {KPI.map(k=>(
                  <div key={k.l} style={{...glass,padding:"1.25rem",borderRadius:12,...glow,position:"relative",overflow:"hidden",borderBottom:k.border?"2px solid "+k.border:undefined}}>
                    <div style={{position:"absolute",top:0,right:0,padding:"1rem",opacity:0.1}}><span className="material-symbols-outlined" style={{fontSize:"2.5rem"}}>mark_email_unread</span></div>
                    <p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",color:C.muted,margin:"0 0 4px"}}>{k.l}</p>
                    <h3 style={{fontFamily:M,fontWeight:700,fontSize:"2rem",color:k.vc,margin:"0 0 0.5rem"}}>{k.v}</h3>
                    <div style={{display:"flex",alignItems:"center",gap:4,fontSize:"0.6rem",color:k.subC}}>
                      {k.pulse&&<span style={{width:6,height:6,borderRadius:"50%",background:C.cyan,display:"inline-block"}}/>}{k.sub}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {/* FILTER */}
            <section style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
              <div style={{display:"flex",gap:"1rem",alignItems:"center"}}>
                <div style={{flex:1,position:"relative"}}>
                  <span className="material-symbols-outlined" style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:"1.2rem",pointerEvents:"none"}}>search</span>
                  <input type="text" placeholder="Filter by manifest ID, vessel name, or status..." style={{width:"100%",background:C.bgLowest,border:"none",borderBottom:"2px solid rgba(68,71,77,0.2)",borderRadius:"8px 8px 0 0",padding:"0.75rem 1rem 0.75rem 42px",fontSize:"0.875rem",color:C.text,fontFamily:I,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} onFocus={e=>(e.currentTarget.style.borderBottomColor=C.cyan)} onBlur={e=>(e.currentTarget.style.borderBottomColor="rgba(68,71,77,0.2)")}/>
                </div>
                <button style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.75rem 1rem",background:C.bgCardH,border:"none",borderRadius:10,cursor:"pointer",fontSize:"0.875rem",fontWeight:500,color:C.text,transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgBright)} onMouseLeave={e=>(e.currentTarget.style.background=C.bgCardH)}>
                  <span className="material-symbols-outlined">sort</span>Newest First
                </button>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"0.5rem"}}>
                {FILTERS.map(f=>(
                  <button key={f} onClick={()=>setActiveFilter(f)} style={{padding:"6px 16px",borderRadius:999,fontSize:"0.75rem",fontWeight:700,border:"none",cursor:"pointer",background:activeFilter===f?C.primary:"rgba(36,42,52,1)",color:activeFilter===f?"#003256":C.muted,transition:"all 0.2s"}}>{f}</button>
                ))}
              </div>
            </section>
            {/* TABS */}
            <div style={{display:"flex",gap:"2rem",borderBottom:"1px solid rgba(68,71,77,0.1)",paddingBottom:0}}>
              {TABS.map((t,i)=>(
                <button key={t} onClick={()=>setActiveTab(t)} style={{paddingBottom:"1rem",background:"none",border:"none",cursor:"pointer",fontSize:"0.875rem",fontWeight:activeTab===t?700:400,color:activeTab===t?C.primary:C.muted,borderBottom:activeTab===t?"2px solid "+C.primary:"2px solid transparent",display:"flex",alignItems:"center",gap:"0.5rem",transition:"color 0.2s",marginLeft:i===TABS.length-1?"auto":0}}>
                  {t}{t==="Action Required"&&<span style={{background:C.error,color:"#690005",width:20,height:20,borderRadius:"50%",fontSize:"0.6rem",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>5</span>}
                </button>
              ))}
            </div>
            {/* TIMELINE */}
            <section style={{display:"flex",flexDirection:"column",gap:"2.5rem",position:"relative"}}>
              <div style={{position:"absolute",left:26,top:16,bottom:0,width:1,background:"linear-gradient(to bottom,rgba(68,71,77,0.3),transparent)"}}/>
              {/* TODAY */}
              <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"0.5rem"}}>
                  <div style={{width:52,display:"flex",justifyContent:"center"}}><span style={{width:8,height:8,borderRadius:"50%",background:C.cyan,display:"inline-block",boxShadow:"0 0 8px rgba(76,214,255,0.6)"}}/></div>
                  <h4 style={{fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.2em",color:C.cyan,margin:0}}>Today</h4>
                </div>
                {/* Card 1: High Priority */}
                <div style={{marginLeft:52,...glass,borderRadius:12,overflow:"hidden",borderLeft:"4px solid "+C.error,transition:"background 0.3s",...glow}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(46,53,63,0.7)")} onMouseLeave={e=>(e.currentTarget.style.background="rgba(46,53,63,0.4)")}>
                  <div style={{padding:"1.5rem",display:"flex",gap:"1.5rem"}}>
                    <div style={{width:48,height:48,borderRadius:8,background:"rgba(147,0,10,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span className="material-symbols-outlined" style={{color:C.error,fontVariationSettings:"FILL 1"}}>priority_high</span>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"0.5rem"}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",flexWrap:"wrap",marginBottom:"0.5rem"}}>
                            <h5 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.text,margin:0}}>Urgent: Procurement Delay - Manifest #88219</h5>
                            <span style={{padding:"2px 8px",background:"rgba(255,180,171,0.1)",color:C.error,fontSize:"0.6rem",fontWeight:700,borderRadius:4}}>High Priority</span>
                            <span style={{width:8,height:8,background:C.primary,borderRadius:"50%",display:"inline-block"}}/>
                          </div>
                          <p style={{fontSize:"0.875rem",color:C.muted,margin:0,lineHeight:1.5}}>Vessel "Everest Navigator" reported a 12h delay at Port of Singapore. Terminal berth re-allocation required.</p>
                        </div>
                        <span style={{fontSize:"0.75rem",color:"rgba(196,198,206,0.6)"}}>12:45 PM</span>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:"0.75rem",margin:"1rem 0"}}>
                        {[{icon:"sailing",l:"Everest Navigator"},{icon:"location_on",l:"Singapore"}].map(tag=>(
                          <div key={tag.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:"0.75rem",color:C.muted,background:C.bgLowest,padding:"4px 10px",borderRadius:8}}>
                            <span className="material-symbols-outlined" style={{fontSize:"0.875rem"}}>{tag.icon}</span>{tag.l}
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap"}}>
                        <button style={{padding:"0.5rem 1.25rem",background:C.primary,color:"#003256",fontWeight:700,fontSize:"0.875rem",border:"none",borderRadius:8,cursor:"pointer",transition:"filter 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.filter="brightness(1.1)")} onMouseLeave={e=>(e.currentTarget.style.filter="none")}>View Manifest</button>
                        <button style={{padding:"0.5rem 1.25rem",background:C.bgHigh,color:C.text,fontWeight:700,fontSize:"0.875rem",border:"none",borderRadius:8,cursor:"pointer",transition:"background 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgBright)} onMouseLeave={e=>(e.currentTarget.style.background=C.bgHigh)}>Re-route Assistance</button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Card 2: Quotation */}
                <div style={{marginLeft:52,...glass,borderRadius:12,overflow:"hidden",transition:"background 0.3s"}} onMouseEnter={e=>(e.currentTarget.style.background="rgba(46,53,63,0.7)")} onMouseLeave={e=>(e.currentTarget.style.background="rgba(46,53,63,0.4)")}>
                  <div style={{padding:"1.5rem",display:"flex",gap:"1.5rem"}}>
                    <div style={{width:48,height:48,borderRadius:8,background:`${C.cyanCont}66`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span className="material-symbols-outlined" style={{color:C.cyan,fontVariationSettings:"FILL 1"}}>request_quote</span>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"0.5rem",marginBottom:"0.75rem"}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"0.5rem"}}>
                            <h5 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.text,margin:0}}>New Quotation Received: Fuel Supply</h5>
                            <span style={{padding:"2px 8px",background:`${C.cyanCont}`,color:C.cyan,fontSize:"0.6rem",fontWeight:700,borderRadius:4}}>Quotation</span>
                          </div>
                          <p style={{fontSize:"0.875rem",color:C.muted,margin:0}}>Maritime Energy Ltd has submitted a competitive quote for Request #RFQ-0092. Total: $42,500.00</p>
                        </div>
                        <span style={{fontSize:"0.75rem",color:"rgba(196,198,206,0.6)"}}>09:15 AM</span>
                      </div>
                      <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap",marginTop:"1rem"}}>
                        <button style={{padding:"0.5rem 1.25rem",background:C.cyan,color:"#003543",fontWeight:700,fontSize:"0.875rem",border:"none",borderRadius:8,cursor:"pointer"}}>View Quote</button>
                        <button style={{padding:"0.5rem 1.25rem",border:"1px solid rgba(68,71,77,0.3)",color:C.text,fontWeight:700,fontSize:"0.875rem",background:"transparent",borderRadius:8,cursor:"pointer"}}>Compare</button>
                        <button style={{padding:"0.5rem 1.25rem",background:"none",border:"none",cursor:"pointer",color:C.muted,fontWeight:700,fontSize:"0.875rem",marginLeft:"auto"}}>Dismiss</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* YESTERDAY */}
              <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"0.5rem"}}>
                  <div style={{width:52,display:"flex",justifyContent:"center"}}><span style={{width:8,height:8,borderRadius:"50%",background:"rgba(196,198,206,0.4)",display:"inline-block"}}/></div>
                  <h4 style={{fontSize:"0.65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.2em",color:C.muted,margin:0}}>Yesterday</h4>
                </div>
                {/* Card 3: Compliance */}
                <div style={{marginLeft:52,...glass,borderRadius:12,overflow:"hidden",opacity:0.8,transition:"all 0.3s"}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.opacity="1";(e.currentTarget as HTMLElement).style.background="rgba(46,53,63,0.7)";}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.opacity="0.8";(e.currentTarget as HTMLElement).style.background="rgba(46,53,63,0.4)";}}>
                  <div style={{padding:"1.5rem",display:"flex",gap:"1.5rem"}}>
                    <div style={{width:48,height:48,borderRadius:8,background:`${C.secCont}66`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span className="material-symbols-outlined" style={{color:C.secondary,fontVariationSettings:"FILL 1"}}>verified_user</span>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"0.5rem",marginBottom:"0.75rem"}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"0.5rem"}}>
                            <h5 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.text,margin:0}}>Annual Vessel Verification Due</h5>
                            <span style={{padding:"2px 8px",background:`${C.secCont}`,color:C.secondary,fontSize:"0.6rem",fontWeight:700,borderRadius:4}}>Compliance</span>
                          </div>
                          <p style={{fontSize:"0.875rem",color:C.muted,margin:0}}>Verification documents for "Northern Star" are expiring in 14 days. Please upload updated certificates.</p>
                        </div>
                        <span style={{fontSize:"0.75rem",color:"rgba(196,198,206,0.6)"}}>Oct 14, 2023</span>
                      </div>
                      <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap",marginTop:"1rem"}}>
                        <button style={{padding:"0.5rem 1.25rem",background:C.secondary,color:"#04315a",fontWeight:700,fontSize:"0.875rem",border:"none",borderRadius:8,cursor:"pointer"}}>Upload Documents</button>
                        <button style={{padding:"0.5rem 1.25rem",border:"1px solid rgba(68,71,77,0.3)",color:C.text,fontWeight:700,fontSize:"0.875rem",background:"transparent",borderRadius:8,cursor:"pointer"}}>Remind Me Later</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {/* FOOTER PREFERENCES */}
            <footer style={{marginTop:"1rem",paddingTop:"2rem",borderTop:"1px solid rgba(68,71,77,0.1)"}}>
              <div style={{...glass,padding:"2rem",borderRadius:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"1.5rem",borderTop:"1px solid rgba(68,71,77,0.1)"}}>
                <div style={{display:"flex",gap:"2.5rem",flexWrap:"wrap"}}>
                  <div>
                    <p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",color:C.muted,margin:"0 0 0.75rem"}}>Delivery Methods</p>
                    <div style={{display:"flex",gap:"1rem"}}>
                      {[{icon:"mail",l:"Email",on:true},{icon:"notifications_active",l:"Push",on:true},{icon:"sms",l:"SMS",on:false}].map(d=>(
                        <div key={d.l} style={{display:"flex",alignItems:"center",gap:4,color:d.on?C.primary:C.muted,opacity:d.on?1:0.4}}>
                          <span className="material-symbols-outlined" style={{fontSize:"1.2rem",fontVariationSettings:d.on?"FILL 1":"FILL 0"}}>{d.icon}</span>
                          <span style={{fontSize:"0.75rem",fontWeight:700}}>{d.l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{width:1,background:"rgba(68,71,77,0.2)"}}/>
                  <div>
                    <p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",color:C.muted,margin:"0 0 0.75rem"}}>System Status</p>
                    <div style={{display:"flex",alignItems:"center",gap:6,color:C.cyan}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:C.cyan,display:"inline-block"}}/>
                      <span style={{fontSize:"0.75rem",fontWeight:700}}>All Engines Operational</span>
                    </div>
                  </div>
                </div>
                <a href="#" style={{display:"flex",alignItems:"center",gap:6,color:C.muted,textDecoration:"none",fontSize:"0.875rem",fontWeight:700,transition:"color 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.color=C.primary)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>
                  Manage Notification Settings <span className="material-symbols-outlined" style={{fontSize:"1.1rem"}}>arrow_forward</span>
                </a>
              </div>
            </footer>
          </div>
          {/* RIGHT SIDEBAR */}
          <aside style={{width:288,flexShrink:0,display:"flex",flexDirection:"column",gap:"1.5rem",position:"sticky",top:80,alignSelf:"flex-start"}}>
            <div style={{...glass,padding:"1.5rem",borderRadius:12,...glow,borderTop:"1px solid rgba(68,71,77,0.1)"}}>
              <h4 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.text,margin:"0 0 1rem"}}>Notification Insights</h4>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.5rem"}}>
                <span style={{fontSize:"0.875rem",color:C.muted}}>Today s Activity</span>
                <span style={{fontSize:"0.875rem",fontWeight:700}}>+18%</span>
              </div>
              <div style={{width:"100%",height:6,background:C.bgLow,borderRadius:999,overflow:"hidden",marginBottom:"1.5rem"}}>
                <div style={{width:"65%",height:"100%",background:C.primary,borderRadius:999}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
                {[{l:"Avg Response",v:"14m",vc:C.cyan},{l:"Action Rate",v:"92%",vc:C.secondary}].map(m=>(
                  <div key={m.l} style={{background:C.bgLow,padding:"0.75rem",borderRadius:8,textAlign:"center"}}>
                    <p style={{fontSize:"0.6rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 4px"}}>{m.l}</p>
                    <p style={{fontFamily:M,fontWeight:700,fontSize:"1.2rem",color:m.vc,margin:0}}>{m.v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{...glass,padding:"1.5rem",borderRadius:12,...glow,borderTop:"1px solid rgba(68,71,77,0.1)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
                <h4 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.text,margin:0}}>Active Flow</h4>
                <span className="material-symbols-outlined" style={{color:C.muted,cursor:"pointer"}}>refresh</span>
              </div>
              <ul style={{listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:"1.25rem"}}>
                {[{bar:C.cyan,title:"RFQ #0092 Pending",sub:"3 bids requiring review",meta:"Deadline: 4h 20m",metaC:C.cyan},{bar:C.primary,title:"Payment Verified",sub:"Manifest #88121 - Port Dues",meta:"Yesterday",metaC:"rgba(196,198,206,0.4)"}].map(item=>(
                  <li key={item.title} style={{display:"flex",gap:"0.75rem"}}>
                    <div style={{width:4,height:40,background:item.bar,borderRadius:999,flexShrink:0}}/>
                    <div>
                      <p style={{fontSize:"0.75rem",fontWeight:700,color:C.text,margin:0}}>{item.title}</p>
                      <p style={{fontSize:"0.65rem",color:C.muted,margin:"2px 0"}}>{item.sub}</p>
                      <p style={{fontSize:"0.6rem",color:item.metaC,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,margin:0}}>{item.meta}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{...glass,padding:"1.5rem",borderRadius:12,...glow,borderTop:"1px solid rgba(68,71,77,0.1)",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",right:-16,bottom:-16,opacity:0.1}}><span className="material-symbols-outlined" style={{fontSize:"4rem",color:C.error}}>event_busy</span></div>
              <h4 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.error,margin:"0 0 1rem"}}>Crucial Deadlines</h4>
              <div style={{padding:"0.75rem",background:"rgba(255,180,171,0.05)",border:"1px solid rgba(255,180,171,0.2)",borderRadius:8}}>
                <p style={{fontSize:"0.6rem",fontWeight:700,color:C.error,textTransform:"uppercase",margin:"0 0 4px"}}>In 2 Days</p>
                <p style={{fontSize:"0.75rem",fontWeight:700,color:C.text,margin:"0 0 2px"}}>Insurance Certificate Renewal</p>
                <p style={{fontSize:"0.65rem",color:C.muted,margin:0}}>Global Ocean Carrier Fleet</p>
              </div>
            </div>
            <div style={{...glass,borderRadius:12,height:128,overflow:"hidden",position:"relative",...glow}}>
              <div style={{position:"absolute",inset:0,backgroundImage:"url("+MAP+")",backgroundSize:"cover",backgroundPosition:"center",opacity:0.4}}/>
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center"}}>
                <div><p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.2em",color:"rgba(156,202,255,0.8)",margin:"0 0 4px"}}>Network Pulse</p><p style={{fontFamily:M,fontWeight:700,fontSize:"0.9rem",color:C.text,margin:0}}>Real-time Global Sync</p></div>
              </div>
            </div>
          </aside>
        </div>
      </main>
      {/* FAB */}
      <button style={{position:"fixed",bottom:32,right:32,width:56,height:56,background:C.primary,color:"#003256",borderRadius:"50%",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 32px rgba(156,202,255,0.3)",zIndex:70,transition:"transform 0.2s"}} onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.1)")} onMouseLeave={e=>(e.currentTarget.style.transform="none")}>
        <span className="material-symbols-outlined" style={{fontVariationSettings:"FILL 1"}}>chat_bubble</span>
      </button>
    </div>
  );
};
export default NotificationsPage;
