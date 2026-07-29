import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { profilesService } from "../../../services/profiles";

const C={bg:"#050B14",bgCard:"#19202a",bgCardH:"#242a34",bgHigh:"#2e353f",bgBright:"#333a44",bgLowest:"#080f18",bgLow:"#151c26",border:"rgba(68,71,77,0.1)",borderV:"rgba(68,71,77,0.2)",text:"#dce3f0",muted:"#c4c6ce",dim:"#8e9098",cyan:"#4cd6ff",primary:"#9ccaff",secondary:"#a6c9fa",primCont:"#00203a",terCont:"#00222c",secCont:"#244872",error:"#ffb4ab",white:"#ffffff"};
const M="Manrope,sans-serif",I="Inter,sans-serif";
const glass:React.CSSProperties={background:"rgba(46,53,63,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(156,202,255,0.1)"};
const sec:React.CSSProperties={...glass,borderRadius:16,padding:"2rem",display:"flex",flexDirection:"column",gap:"2rem"};
const lbl:React.CSSProperties={fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em",color:C.muted,display:"block",marginBottom:"0.5rem"};
const inp:React.CSSProperties={width:"100%",background:C.bgLowest,border:"none",borderBottom:"2px solid rgba(68,71,77,0.3)",padding:"0.75rem 0",fontSize:"1rem",color:C.text,fontFamily:I,outline:"none",transition:"border-color 0.2s",boxSizing:"border-box"};
const onF=(e:React.FocusEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>(e.currentTarget.style.borderBottomColor=C.primary);
const onB=(e:React.FocusEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>(e.currentTarget.style.borderBottomColor="rgba(68,71,77,0.3)");
const PROF="https://lh3.googleusercontent.com/aida-public/AB6AXuDQ1YrFdJf7PUPYLedNLjWFEUl_cgSv3xe6ozL-XXTx9muFxjPQ2hSwroM5izDdFVelLEPfcs2ms56lvJXIfnI8V6IwZtD-bfdKIWyWTTcYMUCYqnoYP7Id2jIkmzUOxNjb0DMGLWWSbwVkR72jGNUbIZLy3qyKkhQlD5w0bhIGlgavZwmb0bzpiVTx7C_DCdtcN1M0sm94M8ecKz_D8rkerlYZ09F6kAsTCl832ADxUvyPhPzygBvwG4cnL_MDrrOTjlMAHUGI8wLQ";
const BANNER="https://lh3.googleusercontent.com/aida-public/AB6AXuCTRRAPV4_Yz6tE-6lWdQdIECNy4j4jdd1DzsWDT3df2353zxohru_vjYwO26xRGv68GK-q-Iz3YTPmDpj8nEDicmdWYLTvPCGh_JoKTcxIPdEHboAnEIRquwQBkSGDvS1GjNX3s4C82pbCQzMpmm8vlZPTJXxyFV3TBgwzcpxzjEk2StvDyAKXrAQDMsr95YP0noKVs-lPY_2mK-Td3PJQr8htjhg4O2j1X9_Ml5FoGZ8X_6sFDSIUqX_T-XjKQAzz4hCPjQDjHj3B";
const GALL="https://lh3.googleusercontent.com/aida-public/AB6AXuAFq9nlnD0ZPCX8fITLvipqHHRORyRBzWFkTmzy8OAQ7hCVa9s0r4HnmP8DFIEtuULlgZmfeh_2525BFjNEf-s0uF-uKZqT1lkVMhNXfw1uXHbsHXFEYIOrlkOXE_UK3CpS2cS1aNiEhAzraw290TFBH5MWaRfjwmTN3tnta8-B_JqYWre2UkfZMld82TtQdDcHq6iFqV-6W4MeKRbL5dzE1m_oy2FioZmsTkVHop-b7X6wTGfMU48DfXeyXwHkB_A-IxIZ06GF2-Xn";
const VESSELS=[{id:"v1",icon:"deployed_code",label:"Container Ships"},{id:"v2",icon:"layers",label:"Bulk Carriers"},{id:"v3",icon:"oil_barrel",label:"Tankers"},{id:"v4",icon:"anchor",label:"Tugs"}];

export const AddService:React.FC=()=>{
  const navigate=useNavigate();
  const [vessels,setVessels]=useState(["v1","v2","v4"]);
  const [serviceTypes,setServiceTypes]=useState(["Recurring","Maintenance"]);
  const [pricing,setPricing]=useState("Quotation Based");
  const [s247,setS247]=useState(true);
  const [onboard,setOnboard]=useState(true);
  const [c1,setC1]=useState(false);
  const [c2,setC2]=useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ title: "Automated Hull Cleaning", ports: "Singapore, Rotterdam, Busan" });

  const toggleV=(id:string)=>setVessels(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const toggleT=(t:string)=>setServiceTypes(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t]);
  const Tog=({on,set}:{on:boolean;set:()=>void})=>(
    <button onClick={set} style={{width:40,height:20,borderRadius:999,background:on?C.cyan:C.bgHigh,position:"relative",border:"none",cursor:"pointer",flexShrink:0,transition:"background 0.3s"}}>
      <div style={{position:"absolute",top:2,left:on?22:2,width:16,height:16,borderRadius:"50%",background:C.white,transition:"left 0.3s"}}/>
    </button>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let currentProfile: any = null;
      try {
        currentProfile = await profilesService.getMyProfile();
      } catch (err: any) {
        console.warn("Could not fetch current profile", err);
      }
      const existingSkills = currentProfile?.skills || [];
      const existingPorts = currentProfile?.ports_served || [];
      const newSkills = Array.from(new Set([...existingSkills, formData.title.trim()]));
      const newPortsRaw = formData.ports.split(',').map(p => p.trim()).filter(Boolean);
      const newPorts = Array.from(new Set([...existingPorts, ...newPortsRaw]));
      await profilesService.updateMyProfile({
        skills: newSkills,
        ports_served: newPorts
      });
      navigate('/success', { state: { type: 'service_published' } });
    } catch (err) {
      console.error('Failed to add service', err);
      alert('Failed to publish service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:"100vh",display:"flex",flexDirection:"column",overflowY:"auto"}}>
      <header style={{position:"sticky",top:0,zIndex:50,background:"rgba(5,11,20,0.4)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.75rem 2rem",borderBottom:"1px solid rgba(68,71,77,0.1)",boxShadow:"0 20px 40px rgba(0,209,255,0.08)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:"1.5rem"}}>
          <span style={{fontFamily:M,fontWeight:700,fontSize:"1.2rem",color:"#f1f5f9",letterSpacing:"-0.03em"}}>Oceanic Horizon</span>
          <nav style={{display:"flex",gap:"2rem"}}>
            {["Marketplace","Vessels","Logistics"].map(l=>(
              <a key={l} href="#" style={{color:"#94a3b8",fontWeight:500,fontSize:"0.875rem",textDecoration:"none"}}>{l}</a>
            ))}
          </nav>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
          <button style={{display:"flex",alignItems:"center",gap:"0.5rem",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:"0.875rem"}}>
            <span className="material-symbols-outlined">help</span>Support
          </button>
          <div style={{width:32,height:32,borderRadius:"50%",overflow:"hidden",border:"1px solid rgba(68,71,77,0.3)"}}>
            <img src={PROF} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          </div>
        </div>
      </header>

      <div style={{flex:1,maxWidth:1440,width:"100%",margin:"0 auto",padding:"2rem 1.5rem 7rem",display:"flex",gap:"2rem",boxSizing:"border-box"}}>
        <aside style={{width:240,flexShrink:0,position:"sticky",top:88,alignSelf:"flex-start",display:"flex",flexDirection:"column",gap:"2rem"}}>
          <div>
            <p style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.2em",color:"rgba(196,198,206,0.6)",marginBottom:"1.5rem"}}>Listing Sections</p>
            <div style={{position:"relative",display:"flex",flexDirection:"column",gap:"1.5rem"}}>
              <div style={{position:"absolute",left:15,top:8,bottom:8,width:2,background:C.bgCardH}}/>
              {[{n:1,l:"Basic Info",id:"basic-info"},{n:2,l:"Service Details",id:"service-details"},{n:3,l:"Coverage & Pricing",id:"coverage-pricing"},{n:4,l:"Certifications & Media",id:"certifications-gallery"},{n:5,l:"Final Review",id:"final-review"}].map((s,i)=>(
                <a key={s.id} href={"#"+s.id} style={{position:"relative",display:"flex",alignItems:"center",gap:"1rem",textDecoration:"none"}}>
                  <div style={{zIndex:1,width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:700,background:i===0?C.cyan:C.bgCardH,color:i===0?"#0d141d":C.muted,boxShadow:i===0?"0 0 0 4px rgba(76,214,255,0.15)":undefined,border:i===0?"none":"1px solid rgba(68,71,77,0.2)"}}>{s.n}</div>
                  <span style={{fontSize:"0.875rem",fontWeight:i===0?700:500,color:i===0?C.primary:C.muted}}>{s.l}</span>
                </a>
              ))}
            </div>
          </div>
          <div style={{...glass,padding:"1rem",borderRadius:12}}>
            <p style={{fontSize:"0.75rem",color:C.muted,lineHeight:1.5,margin:0}}>Changes are automatically saved to drafts as you fill out the sections.</p>
          </div>
        </aside>
        <section style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:"3rem"}}>
          <header>
            <h1 style={{fontFamily:M,fontWeight:800,fontSize:"clamp(1.75rem,4vw,2.5rem)",letterSpacing:"-0.04em",color:"#f1f5f9",margin:"0 0 0.5rem"}}>Create New Service</h1>
            <p style={{color:C.muted,fontSize:"1rem",margin:0}}>Define your service identity and operational scope for the Global Maritime Network.</p>
          </header>

          {/* S1 BASIC INFO */}
          <div id="basic-info" style={{...sec,scrollMarginTop:96}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}><div style={{width:6,height:32,background:C.primary,borderRadius:999}}/><h2 style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:C.text,margin:0}}>Basic Information</h2></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem"}}>
              <div style={{gridColumn:"span 2"}}><label style={lbl}>Service Name</label><input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} style={{...inp,fontSize:"1.2rem"}} onFocus={onF} onBlur={onB}/></div>
              <div><label style={lbl}>Category</label><div style={{position:"relative"}}><select style={{...inp,appearance:"none",paddingRight:"2rem"}} onFocus={onF} onBlur={onB}><option>Technical Maintenance</option><option>Logistics & Supply Chain</option></select><span className="material-symbols-outlined" style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:"1.1rem",pointerEvents:"none"}}>expand_more</span></div></div>
              <div><label style={lbl}>Subcategory</label><div style={{position:"relative"}}><select style={{...inp,appearance:"none",paddingRight:"2rem"}} onFocus={onF} onBlur={onB}><option>Underwater Services</option><option>Engine Repair</option></select><span className="material-symbols-outlined" style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:"1.1rem",pointerEvents:"none"}}>expand_more</span></div></div>
              <div style={{gridColumn:"span 2"}}><label style={lbl}>Detailed Description</label><textarea rows={4} defaultValue="High-efficiency robotic hull scrub designed to minimize biofouling and reduce fuel consumption by up to 12%. Zero emissions, non-abrasive tech suitable for all marine coatings." style={{...inp,resize:"vertical",minHeight:100}} onFocus={onF} onBlur={onB}/></div>
              <div style={{gridColumn:"span 2"}}><label style={lbl}>Banner Upload</label>
                <label style={{position:"relative",border:"2px dashed rgba(68,71,77,0.3)",borderRadius:16,height:192,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden",cursor:"pointer",transition:"all 0.2s",boxSizing:"border-box"}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.primary+"80";}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="rgba(68,71,77,0.3)";}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files.length)alert(`Added ${e.dataTransfer.files.length} file(s)`)}}>
                  <input type="file" style={{display:"none"}} onChange={e=>{if(e.target.files?.length)alert(`Added ${e.target.files.length} file(s)`)}} />
                  <div style={{position:"absolute",inset:0,backgroundImage:"url("+BANNER+")",backgroundSize:"cover",backgroundPosition:"center",opacity:0.1}}/>
                  <span className="material-symbols-outlined" style={{fontSize:"2.5rem",color:C.primary,marginBottom:8}}>cloud_upload</span>
                  <p style={{fontWeight:700,fontSize:"0.875rem",margin:0,position:"relative"}}>Click to update banner</p>
                </label>
              </div>
            </div>
          </div>

          {/* S2 SERVICE DETAILS */}
          <div id="service-details" style={{...sec,scrollMarginTop:96}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}><div style={{width:6,height:32,background:C.primary,borderRadius:999}}/><h2 style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:C.text,margin:0}}>Service Details</h2></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem"}}>
              <div style={{gridColumn:"span 2"}}><label style={lbl}>Scope of Work</label>
                <textarea rows={3} placeholder="Describe core operational activities..." style={{width:"100%",background:C.bgLowest,border:"1px solid rgba(68,71,77,0.2)",borderRadius:12,padding:"1rem",color:C.text,fontFamily:I,fontSize:"0.9rem",outline:"none",resize:"vertical",boxSizing:"border-box",transition:"border-color 0.2s"}} onFocus={e=>(e.currentTarget.style.borderColor=C.primary)} onBlur={e=>(e.currentTarget.style.borderColor="rgba(68,71,77,0.2)")}/>
              </div>
              <div><label style={lbl}>Service Type</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:"0.5rem",marginTop:"0.5rem"}}>
                  {["Recurring","Maintenance","Emergency"].map(t=>(
                    <button key={t} onClick={()=>toggleT(t)} style={{padding:"6px 16px",borderRadius:999,border:"1px solid "+(serviceTypes.includes(t)?C.primary:"rgba(68,71,77,0.3)"),background:serviceTypes.includes(t)?C.primCont:"transparent",color:serviceTypes.includes(t)?C.primary:C.muted,fontSize:"0.875rem",fontWeight:500,cursor:"pointer",transition:"all 0.2s"}}>{t}</button>
                  ))}
                </div>
              </div>
              <div><label style={lbl}>Technical Support</label>
                <div style={{display:"flex",flexDirection:"column",gap:"0.75rem",marginTop:"0.5rem"}}>
                  {[{l:"24/7 Support",icon:"support_agent",v:s247,s:()=>setS247(!s247)},{l:"Onboard Service",icon:"directions_boat",v:onboard,s:()=>setOnboard(!onboard)}].map(row=>(
                    <div key={row.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.75rem",background:C.bgLow,borderRadius:8}}>
                      <span style={{fontSize:"0.875rem",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5rem"}}><span className="material-symbols-outlined" style={{fontSize:"1rem",color:C.primary}}>{row.icon}</span>{row.l}</span>
                      <Tog on={row.v} set={row.s}/>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{gridColumn:"span 2"}}><label style={lbl}>Vessel Compatibility</label>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"1rem",marginTop:"0.5rem"}}>
                  {VESSELS.map(v=>(
                    <button key={v.id} onClick={()=>toggleV(v.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"1rem",borderRadius:12,border:"1px solid "+(vessels.includes(v.id)?C.cyan:"rgba(68,71,77,0.3)"),background:vessels.includes(v.id)?C.terCont:C.bgLow,color:vessels.includes(v.id)?C.cyan:C.muted,cursor:"pointer",gap:"0.5rem",transition:"all 0.2s"}}>
                      <span className="material-symbols-outlined" style={{fontSize:"1.75rem"}}>{v.icon}</span>
                      <span style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* S3 COVERAGE & PRICING */}
          <div id="coverage-pricing" style={{...sec,scrollMarginTop:96}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}><div style={{width:6,height:32,background:C.primary,borderRadius:999}}/><h2 style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:C.text,margin:0}}>Coverage & Pricing</h2></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem"}}>
              <div style={{gridColumn:"span 2"}}><label style={lbl}>Ports Served</label>
                <div style={{background:C.bgLowest,border:"1px solid rgba(68,71,77,0.2)",padding:"0.75rem 1rem",borderRadius:12,display:"flex",flexWrap:"wrap",gap:"0.5rem"}}>
                  {["Singapore","Rotterdam","Busan"].map(p=>(
                    <span key={p} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:C.secCont,color:"#95b7e7",borderRadius:999,fontSize:"0.75rem"}}>{p} <span className="material-symbols-outlined" style={{fontSize:"0.75rem",cursor:"pointer"}}>close</span></span>
                  ))}
                  <input type="text" placeholder="Search & add ports..." value={formData.ports} onChange={e => setFormData({...formData, ports: e.target.value})} style={{background:"transparent",border:"none",outline:"none",fontSize:"0.875rem",color:C.text,minWidth:150}}/>
                </div>
              </div>
              <div style={{gridColumn:"span 2"}}><label style={lbl}>Commercial Model</label>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1rem",marginTop:"0.5rem"}}>
                  {[{l:"Quotation Based",icon:"request_quote"},{l:"Hourly Rate",icon:"schedule"},{l:"Per Job",icon:"work"}].map(m=>(
                    <label key={m.l} style={{position:"relative",display:"flex",flexDirection:"column",padding:"1rem",background:C.bgLow,borderRadius:12,border:"1px solid "+(pricing===m.l?C.primary:"transparent"),cursor:"pointer",transition:"border-color 0.2s"}}>
                      <input type="radio" name="pricing" checked={pricing===m.l} onChange={()=>setPricing(m.l)} style={{position:"absolute",right:14,top:14,accentColor:C.primary}}/>
                      <span className="material-symbols-outlined" style={{color:pricing===m.l?C.primary:C.muted,marginBottom:6}}>{m.icon}</span>
                      <span style={{fontWeight:700,fontSize:"0.875rem",color:C.text}}>{m.l}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div><label style={lbl}>Currency & Pricing</label>
                <div style={{display:"flex",gap:"0.75rem",marginTop:"0.5rem"}}>
                  <select style={{background:C.bgLow,border:"1px solid rgba(68,71,77,0.3)",borderRadius:8,padding:"0.75rem",fontSize:"0.875rem",color:C.text,outline:"none"}}><option>USD ($)</option><option>EUR (EUR)</option></select>
                  <input type="text" defaultValue="4,200" style={{flex:1,background:C.bgLow,border:"1px solid rgba(68,71,77,0.3)",borderRadius:8,padding:"0.75rem",fontSize:"0.9rem",fontWeight:700,color:C.text,outline:"none"}}/>
                </div>
              </div>
              <div><label style={lbl}>Lead Time</label>
                <div style={{position:"relative",marginTop:"0.5rem"}}>
                  <input type="text" defaultValue="48" style={{width:"100%",background:C.bgLow,border:"1px solid rgba(68,71,77,0.3)",borderRadius:8,padding:"0.75rem",fontSize:"0.9rem",color:C.text,outline:"none",boxSizing:"border-box"}}/>
                  <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:"0.6rem",fontWeight:700,color:C.muted,textTransform:"uppercase"}}>Hours</span>
                </div>
              </div>
            </div>
          </div>
          {/* S4 CERTS & GALLERY */}
          <div id="certifications-gallery" style={{...sec,scrollMarginTop:96}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}><div style={{width:6,height:32,background:C.primary,borderRadius:999}}/><h2 style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:C.text,margin:0}}>Certifications & Gallery</h2></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2.5rem"}}>
              <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}><label style={lbl}>Required Documentation</label>
                <label style={{border:"2px dashed rgba(68,71,77,0.2)",borderRadius:12,padding:"2rem",display:"flex",flexDirection:"column",alignItems:"center",gap:"0.75rem",cursor:"pointer",transition:"background 0.2s",boxSizing:"border-box"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgLow)} onMouseLeave={e=>(e.currentTarget.style.background="transparent")} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files.length)alert(`Added ${e.dataTransfer.files.length} file(s)`)}}>
                  <input type="file" multiple style={{display:"none"}} onChange={e=>{if(e.target.files?.length)alert(`Added ${e.target.files.length} file(s)`)}} />
                  <span className="material-symbols-outlined" style={{fontSize:"2rem",color:C.muted}}>upload_file</span>
                  <p style={{fontWeight:500,fontSize:"0.875rem",margin:0}}>Upload ISO, Port Permits, or Licenses</p>
                  <p style={{fontSize:"0.6rem",color:C.muted,textTransform:"uppercase",margin:0}}>PDF, PNG, JPG (Max 5MB)</p>
                </label>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.75rem 1rem",background:C.bgLow,borderRadius:8,borderLeft:"2px solid "+C.primary}}>
                  <span style={{fontSize:"0.75rem",fontWeight:500}}>ISO_9001_Certification_2023.pdf</span>
                  <button style={{background:"none",border:"none",cursor:"pointer",color:C.error,display:"flex"}}><span className="material-symbols-outlined" style={{fontSize:"1.1rem"}}>delete</span></button>
                </div>
              </div>
              <div><label style={lbl}>Service Gallery</label>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.75rem",marginTop:"0.5rem"}}>
                  <div style={{aspectRatio:"1",borderRadius:8,background:C.bgLow,border:"1px solid rgba(68,71,77,0.2)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgCard)} onMouseLeave={e=>(e.currentTarget.style.background=C.bgLow)}><span className="material-symbols-outlined" style={{fontSize:"1.5rem",color:C.muted}}>add</span></div>
                  <div style={{aspectRatio:"1",borderRadius:8,overflow:"hidden",border:"1px solid rgba(68,71,77,0.2)"}}><img src={GALL} alt="Gallery" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
                </div>
              </div>
            </div>
          </div>

          {/* S5 FINAL REVIEW */}
          <div id="final-review" style={{display:"flex",flexDirection:"column",gap:"2rem",paddingBottom:32}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}><div style={{width:6,height:32,background:C.primary,borderRadius:999}}/><h2 style={{fontFamily:M,fontWeight:700,fontSize:"1.4rem",color:C.text,margin:0}}>Live Marketplace Preview</h2></div>
            <div style={{...glass,borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.05)",boxShadow:"0 25px 50px rgba(0,0,0,0.4)"}}>
              <div style={{position:"relative",overflow:"hidden",height:280}}>
                <img src={GALL} alt="Preview" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(13,20,29,0.9),transparent)"}}/>
                <div style={{position:"absolute",bottom:24,left:24}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:"rgba(0,34,44,0.8)",backdropFilter:"blur(8px)",border:"1px solid rgba(76,214,255,0.2)",borderRadius:999}}>
                    <span className="material-symbols-outlined" style={{fontSize:"1rem",color:C.cyan,fontVariationSettings:"FILL 1"}}>star</span>
                    <span style={{fontWeight:700,fontSize:"0.875rem",color:C.cyan}}>New Service</span>
                  </div>
                </div>
              </div>
              <div style={{padding:"2rem",background:"rgba(36,42,52,0.2)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1.5rem",flexWrap:"wrap",gap:"1rem"}}>
                  <div>
                    <h3 style={{fontFamily:M,fontWeight:800,fontSize:"1.75rem",color:C.white,margin:"0 0 0.5rem"}}>Automated Hull Cleaning</h3>
                    <p style={{color:C.muted,fontSize:"0.875rem",margin:0,display:"flex",alignItems:"center",gap:6}}><span className="material-symbols-outlined" style={{fontSize:"1rem"}}>location_on</span>Available in: Singapore, Rotterdam, Busan</p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{fontSize:"0.6rem",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.15em",color:C.muted,margin:"0 0 4px"}}>Est. Price</p>
                    <p style={{fontFamily:M,fontWeight:800,fontSize:"2rem",color:C.primary,margin:0}}>$4,200 <span style={{fontSize:"0.75rem",fontWeight:400,color:C.muted}}>/ vessel</span></p>
                  </div>
                </div>
                <p style={{color:C.muted,lineHeight:1.7,maxWidth:640,marginBottom:"2rem",fontSize:"0.9rem"}}>High-efficiency robotic hull scrub designed to minimize biofouling and reduce fuel consumption by up to 12%. Zero emissions, non-abrasive tech suitable for all marine coatings.</p>
                <div style={{display:"flex",gap:"1rem"}}>
                  <button style={{flex:1,background:C.cyan,color:"#0d141d",padding:"1rem",borderRadius:12,fontFamily:M,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.1em",border:"none",cursor:"pointer"}}>Request Quote</button>
                  <button style={{padding:"1rem",border:"1px solid rgba(68,71,77,0.3)",borderRadius:12,background:"transparent",color:C.text,cursor:"pointer",display:"flex",alignItems:"center"}}><span className="material-symbols-outlined">favorite</span></button>
                </div>
              </div>
            </div>
            <div style={{...glass,borderRadius:16,padding:"2rem",display:"flex",flexDirection:"column",gap:"1.5rem"}}>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:"1.2rem",color:C.text,margin:0}}>Compliance & Verification</h3>
              {[{v:c1,s:()=>setC1(!c1),t:"Accuracy Guarantee",sub:"I confirm this information is accurate and reflects current operational capabilities."},{v:c2,s:()=>setC2(!c2),t:"Licensing & Permits",sub:"I have the necessary licenses and regional port authority permits to perform these services."}].map((item,i)=>(
                <label key={i} style={{display:"flex",alignItems:"flex-start",gap:"1rem",padding:"1rem",borderRadius:12,background:"rgba(21,28,38,0.3)",border:"1px solid "+(item.v?"rgba(156,202,255,0.2)":"transparent"),cursor:"pointer",transition:"border-color 0.2s"}}>
                  <input type="checkbox" checked={item.v} onChange={item.s} style={{marginTop:2,width:18,height:18,accentColor:C.primary,flexShrink:0,cursor:"pointer"}}/>
                  <div>
                    <p style={{fontWeight:700,fontSize:"0.875rem",color:C.text,margin:"0 0 4px"}}>{item.t}</p>
                    <p style={{fontSize:"0.75rem",color:C.muted,margin:0}}>{item.sub}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>
        {/* RIGHT SIDEBAR */}
        <aside style={{width:300,flexShrink:0,position:"sticky",top:88,alignSelf:"flex-start",display:"flex",flexDirection:"column",gap:"1.5rem"}}>
          <div style={{...glass,borderRadius:16,padding:"1.5rem",display:"flex",flexDirection:"column",gap:"1.5rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:"1.1rem",color:C.text,margin:0}}>Listing Quality</h3>
              <span style={{fontSize:"0.75rem",fontWeight:700,color:C.primary,background:"rgba(156,202,255,0.1)",padding:"3px 10px",borderRadius:999}}>92%</span>
            </div>
            <div style={{display:"flex",justifyContent:"center",padding:"1rem 0",position:"relative"}}>
              <svg width={128} height={128} style={{transform:"rotate(-90deg)"}}>
                <circle cx={64} cy={64} r={58} fill="transparent" stroke={C.bgCardH} strokeWidth={8}/>
                <circle cx={64} cy={64} r={58} fill="transparent" stroke={C.primary} strokeWidth={8} strokeLinecap="round" strokeDasharray="364.4" strokeDashoffset={29}/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontFamily:M,fontWeight:900,fontSize:"1.5rem",color:C.text}}>92</span>
                <span style={{fontSize:"0.6rem",textTransform:"uppercase",fontWeight:700,color:C.muted}}>Excellent</span>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
              {[{done:true,l:"Basic Info Complete"},{done:true,l:"Vessel Mapped"},{done:false,l:"Gallery Images",note:"Add 2 more for 100%."}].map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"0.75rem",opacity:item.done?1:0.5}}>
                  <span className="material-symbols-outlined" style={{fontSize:"1.2rem",color:item.done?C.primary:C.muted,fontVariationSettings:item.done?"FILL 1":"FILL 0"}}>{item.done?"check_circle":"radio_button_unchecked"}</span>
                  <div><p style={{fontSize:"0.875rem",fontWeight:700,margin:0,color:C.text}}>{item.l}</p>{item.note&&<p style={{fontSize:"0.65rem",color:C.muted,margin:0}}>{item.note}</p>}</div>
                </div>
              ))}
            </div>
            <div style={{paddingTop:"1rem",borderTop:"1px solid rgba(68,71,77,0.2)"}}>
              <h4 style={{fontSize:"0.6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em",color:C.primary,margin:"0 0 0.75rem"}}>Suggestions</h4>
              <div style={{display:"flex",gap:"0.5rem",alignItems:"flex-start"}}><span className="material-symbols-outlined" style={{fontSize:"0.9rem",color:C.primary,flexShrink:0}}>tips_and_updates</span><span style={{fontSize:"0.75rem",color:C.muted}}>Add specialized certs to boost trust score.</span></div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"1rem",...glass,borderRadius:12}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:C.primary,flexShrink:0}}/><p style={{fontSize:"0.75rem",color:C.muted,margin:0}}>Live sync active: Draft saved 2m ago.</p>
          </div>
        </aside>
      </div>
      {/* FOOTER */}
      <footer style={{position:"fixed",bottom:0,left:0,right:0,zIndex:60,background:"rgba(5,11,20,0.9)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid rgba(68,71,77,0.15)",padding:"1rem 2rem",boxShadow:"0 -10px 30px rgba(0,0,0,0.5)"}}>
        <div style={{maxWidth:1440,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:"1rem"}}>
            <button onClick={()=>navigate("/my-services")} style={{padding:"0.6rem 1.5rem",borderRadius:10,background:"transparent",border:"none",cursor:"pointer",fontSize:"0.875rem",fontWeight:700,color:C.text}}>Cancel</button>
            <div style={{width:1,height:24,background:"rgba(68,71,77,0.3)"}}/>
            <button style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.6rem 1.5rem",borderRadius:10,background:"transparent",border:"none",cursor:"pointer",fontSize:"0.875rem",fontWeight:700,color:C.muted}}><span className="material-symbols-outlined">save</span>Save Draft</button>
          </div>
          <button onClick={handleSubmit} disabled={loading} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.75rem 2.5rem",background:"linear-gradient(to right,#9ccaff,#a6c9fa)",color:"#050B14",fontFamily:M,fontWeight:900,fontSize:"0.875rem",textTransform:"uppercase",letterSpacing:"0.1em",border:"none",borderRadius:12,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1}}>
            {loading ? "Publishing..." : "Publish Service"} <span className="material-symbols-outlined">rocket_launch</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
export default AddService;
