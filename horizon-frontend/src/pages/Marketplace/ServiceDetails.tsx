import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { providersService } from '../../services/providers';

const C = {
  bg:'#0d141d',bgCard:'#19202a',bgCardH:'#333a44',bgHigh:'#242a34',
  bgLowest:'#080f18',bgLow:'#151c26',border:'rgba(68,71,77,0.1)',
  borderV:'rgba(142,144,152,0.1)',text:'#dce3f0',muted:'#c4c6ce',dim:'#8e9098',
  cyan:'#4cd6ff',primary:'#9ccaff',secondary:'#a6c9fa',
  cyanCont:'#00222c',primCont:'#00203a',secCont:'#244872',
  error:'#ffb4ab',white:'#ffffff',
};
const M="'Manrope',sans-serif",I="'Inter',sans-serif";
const glass:React.CSSProperties={background:'rgba(46,53,63,0.4)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:'1px solid rgba(142,144,152,0.1)'};
const glow:React.CSSProperties={boxShadow:'0 20px 40px rgba(0,214,255,0.08)'};
const grad='linear-gradient(135deg,#9ccaff 0%,#4cd6ff 100%)';

const HERO_IMG='https://lh3.googleusercontent.com/aida-public/AB6AXuDn9CzEyJjeU146PWSg-qeDvXbsSUXys9LPe8NloRiFea0dTQufVr3Ab99mcpAx8WsUdz58nbT_HXcTvaheKtF9g9OXjGo_6l47HZZIJfyCDoKKZ3LIJWpSDnawM1qA3tJJhDv3hXmpj_orbDEGmHqVKy6E2Tf1JkacDf691NjYNXEPEeyUFQ-VEaaBQx4NkOqPt8qepn1GCL7fICpb3xyyJsp9ekwVXJEXkT-tHsVejBaBAR9t-PedJ7LVy4KG7vQtORmXbXJNInkW';
const MAP_IMG='https://lh3.googleusercontent.com/aida-public/AB6AXuCxwG_2HLobOlLhUPRjaCbvum2uqbyrCKyluZmeCSduyNNpD6KUcMjVlzHqfjB9x7yjCFjRNpWSUsUzZYAC7fTVExFoVwhOaAZlpyJ2GAb3BD_7vDqZbZDwBg4LeQFQD3NY5PHN0Z1YUveonj_dj9hjSRrb1YjMW5-RAnGQ-ypygX76N03SGxc0EBsiPEs1U78k99lY3yrIFMP-LO6DHx5sWZPBXjqYVlmzrjhsQ8XOEoZIfyYhmsAN0hu6uhTCtFNwQhSbIbhNZPq4';
const PROV_LOGO='https://lh3.googleusercontent.com/aida-public/AB6AXuAgQOIbBw60I2eFfhk9XS-EObtjifBqiu0_L8V8iqeXbGU1xVPrNsKdeSB7eErkDUoZQ0PxXfRocDvXvWbhAVLUZmuosoScXGlpwTjkZRdHesADTp3L4Mbt4QOTL3WwRvcGWMmBfc71X7jPSyzbKCLV_kygy4w2jZUmxt3vttiJv_v6t_CMyl80rhGtQDGsZImNpJ3VtM3uBycMt1jRYZyQO0krjRumTpQzwfhvsAPyslUT6ceCud9ZvQ3KlicG_2CsgkBhZQyKo3nW';
const PROF_IMG='https://lh3.googleusercontent.com/aida-public/AB6AXuAnCoRLh1GCGmOn8rBzbayjhAL5vGwF851CRtEokWHbr4t6rcg0Bj52v5jAlg-EcuCcIsYn5xXSyIBxI44_TR-JHjTDjbQ18oWRrSJfWbazZgxSSns5PilvePEWMi_9GFDfwF8gIOMa_uJfb8pz53ZYueLDTXV05zdQjWxtlrcDU_bf2c-4XPsfFnCug4dFEqvXUykIxlQtzZLxXPrbBao-TZs597c_T751iiVL5eyTocYH0pwyQr78n_SlnWjRCglRmOFmi1bMA1ab';

const NAV=[
  {icon:'dashboard',label:'Dashboard',path:'/ship-owner',active:false},
  {icon:'storefront',label:'Provider Marketplace',path:'/marketplace',active:true},
  {icon:'forklift',label:'Supplier Marketplace',path:'/marketplace',active:false},
  {icon:'hail',label:'Requests',path:'/create-request',active:false},
];
const ACC_NAV=[
  {icon:'notifications',label:'Notifications',path:'/'},
  {icon:'description',label:'Documents',path:'/verification'},
  {icon:'person',label:'Profile',path:'/company-profile'},
  {icon:'settings',label:'Settings',path:'/'},
];
const SPECS=[
  {k:'Category',v:'Underwater MRO'},{k:'Region',v:'Global (Major Hubs)'},
  {k:'Response SLA',v:'4 Hours',hi:true},{k:'Avg. Time',v:'8 - 14 Hours'},
  {k:'Service Type',v:'Robot-Led'},{k:'Min. Order',v:'5,000 DWT'},
  {k:'Max Capacity',v:'ULCC / VLOC'},{k:'Method',v:'Non-Abrasive'},
  {k:'Countries Served',v:'45+ Global'},{k:'Service Mode',v:'Port-based'},
  {k:'Est. Lead Time',v:'48 - 72 Hours'},{k:'Warranty',v:'12 Months',hi:true},
];
const INCLUDED=['Pre-cleaning CCTV Inspection & Report','Vertical & Horizontal Hull Surfaces','Niche Area Cleaning (Sea Chests, Rudder)','Biofouling Collection & Safe Disposal'];
const NOT_INC=['Propeller Polishing (Add-on Available)','Major Coating Repairs','Underwater Welding'];
const VESSEL_COMPAT=[
  {v:'Container Ships',ok:true},{v:'Oil Tankers',ok:true},{v:'Bulk Carriers',ok:true},{v:'Cruise Liners',ok:false},
];
const CERTS=[{icon:'verified_user',label:'ISO 9001'},{icon:'award_star',label:'IMPA'},{icon:'gavel',label:'CLASS APPR.'},{icon:'settings_input_component',label:'OEM CERT.'}];
const REVIEWS=[
  {ini:'MS',name:'Maersk Sentinel',role:'Fleet Manager, Singapore',bg:C.primCont,col:C.primary,stars:5,txt:'"The robotic system used was impressive. Zero downtime recorded and the hull inspection report was extremely detailed. Saw a 4.5% efficiency gain in the first week post-cleaning."',ago:'6 DAYS AGO'},
  {ini:'EL',name:'Ever Lean Logistics',role:'Operations Director',bg:C.secCont,col:C.secondary,stars:4,txt:'"Prompt response at Jebel Ali. The team handled the coordination with port authorities seamlessly. Highly recommend for bulk carrier fleets."',ago:'2 WEEKS AGO'},
];
const FAQS=[
  {q:'Is hull cleaning allowed in all ports?',a:"Not all ports allow open-cycle cleaning. However, our robotic system is a 'Closed Loop' system that captures 99% of removed material, making it permissible in strict jurisdictions like Rotterdam and Singapore."},
  {q:'Will this damage my hull coating?',a:'Our robots use water cavitation technology and soft brushes that are calibrated for the anti-fouling paint on your vessel. We perform a test patch before full deployment.'},
  {q:'How long is the service report valid?',a:'Our post-cleaning CCTV reports are typically accepted by most classification societies and insurance providers for a period of 6 months.'},
];

const FaqItem:React.FC<{q:string;a:string}>=({q,a})=>{
  const [open,setOpen]=useState(false);
  return(
    <div style={{...glass,borderRadius:16,overflow:'hidden'}}>
      <button onClick={()=>setOpen(!open)} style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'1.25rem',background:'none',border:'none',cursor:'pointer',color:C.text,textAlign:'left'}}>
        <span style={{fontWeight:700,fontSize:'0.9rem'}}>{q}</span>
        <span className="material-symbols-outlined" style={{transition:'transform 0.2s',transform:open?'rotate(180deg)':'none',flexShrink:0}}>expand_more</span>
      </button>
      {open&&<div style={{padding:'0 1.25rem 1.25rem',fontSize:'0.875rem',color:C.muted,lineHeight:1.6}}>{a}</div>}
    </div>
  );
};

export const ServiceDetails:React.FC=()=>{
  const {providerId,skill}=useParams<{providerId:string;skill:string}>();
  const navigate=useNavigate();
  const [provider,setProvider]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const decodedSkill=skill?decodeURIComponent(skill):'Service';
  const isDummy=providerId?.startsWith('d');

  useEffect(()=>{
    if(isDummy){setLoading(false);return;}
    if(!providerId){setLoading(false);return;}
    providersService.getProviderById(providerId).then(r=>setProvider(r)).catch(()=>{}).finally(()=>setLoading(false));
  },[providerId]);

  const provName=provider?.company_name||'Oceanic Robotics Corp';
  const provLoc=provider?.location||'Oslo, Norway';
  const rating=provider?.rating_avg>0?Number(provider.rating_avg).toFixed(1):'4.9';
  const ports:string[]=provider?.ports_served?.length?provider.ports_served.slice(0,4):['Rotterdam','Singapore','Jebel Ali','Mumbai'];

  if(loading) return <div style={{background:C.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted,fontFamily:I}}>Loading...</div>;

  const navLink=(item:{icon:string;label:string;path:string;active?:boolean})=>(
    <a key={item.label} href="#" onClick={e=>{e.preventDefault();navigate(item.path);}}
      style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.65rem 1rem',borderRadius:8,textDecoration:'none',
        color:item.active?C.primary:C.muted,background:item.active?`${C.primCont}33`:'transparent',
        fontWeight:item.active?700:400,borderRight:item.active?`2px solid ${C.primary}`:'2px solid transparent',transition:'all 0.2s'}}
      onMouseEnter={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background=C.bgHigh;(e.currentTarget as HTMLElement).style.color=C.text;}}}
      onMouseLeave={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background='transparent';(e.currentTarget as HTMLElement).style.color=C.muted;}}}>
      <span className="material-symbols-outlined" style={{fontSize:'1.2rem'}}>{item.icon}</span>
      <span style={{fontSize:'0.8rem'}}>{item.label}</span>
    </a>
  );

  return(
    <div style={{background:C.bg,color:C.text,fontFamily:I,minHeight:'100vh'}}>

      {/* SIDE NAV */}
      <aside style={{position:'fixed',left:0,top:0,bottom:0,width:288,zIndex:40,background:C.bgLow,display:'flex',flexDirection:'column',borderRight:`1px solid ${C.borderV}`}}>
        <div style={{padding:'2rem 1.5rem 1.5rem'}}>
          <h1 style={{fontFamily:M,fontWeight:900,fontSize:'1.4rem',color:C.primary,letterSpacing:'-0.04em',margin:0}}>HORIZON</h1>
          <p style={{fontSize:'0.55rem',textTransform:'uppercase',letterSpacing:'0.2em',color:C.dim,margin:'4px 0 0'}}>Maritime Infrastructure</p>
        </div>
        <nav style={{flex:1,padding:'0 1rem',display:'flex',flexDirection:'column',gap:2}}>
          {NAV.map(navLink)}
          <div style={{padding:'1rem 1rem 0.5rem',fontSize:'0.6rem',fontWeight:700,color:C.dim,textTransform:'uppercase',letterSpacing:'0.2em'}}>Account</div>
          {ACC_NAV.map(navLink)}
        </nav>
        <div style={{padding:'1rem 1.5rem 2rem'}}>
          <button onClick={()=>navigate('/create-request')} style={{width:'100%',padding:'1rem',background:grad,color:'#001d35',fontFamily:M,fontWeight:700,border:'none',borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'0.5rem',...glow}}>
            <span className="material-symbols-outlined" style={{fontSize:'1.2rem'}}>add_circle</span>New Charter Request
          </button>
        </div>
      </aside>

      {/* TOP NAV */}
      <header style={{position:'fixed',top:0,left:288,right:0,height:64,zIndex:30,background:'rgba(13,20,29,0.4)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 2rem',borderBottom:`1px solid ${C.borderV}`}}>
        <div style={{display:'flex',alignItems:'center',gap:'2rem'}}>
          <div style={{position:'relative',width:320}}>
            <span className="material-symbols-outlined" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:'1.2rem',color:C.muted,pointerEvents:'none'}}>search</span>
            <input type="text" placeholder="Search services, vessels, or ports..." style={{width:'100%',background:'rgba(8,15,24,0.5)',border:'none',borderRadius:999,padding:'6px 14px 6px 36px',fontSize:'0.8rem',color:C.text,fontFamily:I,outline:'none',boxSizing:'border-box' as const}}/>
          </div>
          <nav style={{display:'flex',gap:'1.5rem'}}>
            {['Fleet','Logistics','Analytics'].map(l=>(
              <a key={l} href="#" style={{fontSize:'0.8rem',color:C.muted,textDecoration:'none',transition:'color 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.color=C.cyan)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>{l}</a>
            ))}
          </nav>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
          {['help','apps'].map(icon=>(
            <button key={icon} style={{width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',background:'none',border:'none',cursor:'pointer',color:C.muted}} onMouseEnter={e=>(e.currentTarget.style.color=C.cyan)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>
              <span className="material-symbols-outlined">{icon}</span>
            </button>
          ))}
          <div style={{width:32,height:32,borderRadius:'50%',overflow:'hidden',border:`1px solid rgba(156,202,255,0.2)`}}>
            <img src={PROF_IMG} alt="Profile" style={{width:'100%',height:'100%',objectFit:'cover',cursor:'pointer'}} onClick={()=>navigate('/company-profile')}/>
          </div>
        </div>
      </header>

      <main style={{marginLeft:288,paddingTop:64,minHeight:'100vh'}}>

        {/* HERO */}
        <section style={{padding:'2rem 2rem 0'}}>
          <div style={{display:'grid',gridTemplateColumns:'7fr 5fr',gap:'2rem',alignItems:'center'}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1.5rem'}}>
                <span style={{padding:'4px 12px',background:`${C.cyanCont}`,border:`1px solid rgba(76,214,255,0.2)`,borderRadius:999,fontSize:'0.6rem',fontWeight:700,letterSpacing:'0.2em',textTransform:'uppercase',color:C.cyan}}>Underwater Services</span>
                <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 12px',background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:999,fontSize:'0.6rem',fontWeight:700,color:'#4ade80'}}>
                  <span className="material-symbols-outlined" style={{fontSize:'0.8rem',fontVariationSettings:"'FILL' 1"}}>verified</span>Verified Maritime Service
                </div>
              </div>
              {/* Breadcrumb */}
              <nav style={{display:'flex',alignItems:'center',gap:'0.25rem',fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'rgba(196,198,206,0.6)',marginBottom:'1rem'}}>
                <a href="#" onClick={e=>{e.preventDefault();navigate('/marketplace');}} style={{color:'inherit',textDecoration:'none',transition:'color 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.color=C.cyan)} onMouseLeave={e=>(e.currentTarget.style.color='rgba(196,198,206,0.6)')}>Marketplace</a>
                <span className="material-symbols-outlined" style={{fontSize:'0.75rem'}}>chevron_right</span>
                <span style={{cursor:'default'}}>Repairs &amp; Services</span>
                <span className="material-symbols-outlined" style={{fontSize:'0.75rem'}}>chevron_right</span>
                <span style={{color:C.cyan}}>{decodedSkill}</span>
              </nav>
              <h2 style={{fontFamily:M,fontWeight:800,fontSize:'clamp(2.5rem,6vw,4.5rem)',letterSpacing:'-0.04em',color:C.white,margin:'0 0 1rem',lineHeight:1}}>{decodedSkill}</h2>
              <div style={{display:'flex',alignItems:'center',gap:'1.5rem',marginBottom:'1.5rem',flexWrap:'wrap',fontSize:'0.75rem',color:C.muted}}>
                <span style={{display:'flex',alignItems:'center',gap:6}}><span className="material-symbols-outlined" style={{fontSize:'0.9rem',color:C.cyan}}>fingerprint</span>Service ID: <span style={{color:C.white,fontWeight:700}}>HC-9942</span></span>
                <span style={{width:4,height:4,borderRadius:'50%',background:'rgba(68,71,77,0.3)',display:'inline-block'}}/>
                <span style={{display:'flex',alignItems:'center',gap:6}}><span className="material-symbols-outlined" style={{fontSize:'0.9rem',color:C.cyan}}>category</span>Subcategory: <span style={{color:C.white,fontWeight:700}}>Underwater MRO</span></span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'2rem',marginBottom:'2rem',flexWrap:'wrap'}}>
                <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                  <div style={{display:'flex',color:C.cyan}}>
                    {[1,2,3,4].map(i=><span key={i} className="material-symbols-outlined" style={{fontSize:'1.1rem',fontVariationSettings:"'FILL' 1"}}>star</span>)}
                    <span className="material-symbols-outlined" style={{fontSize:'1.1rem',fontVariationSettings:"'FILL' 1"}}>star_half</span>
                  </div>
                  <span style={{fontWeight:700,color:C.text}}>{rating}</span>
                  <span style={{color:C.muted,fontSize:'0.875rem'}}>(184 Reviews)</span>
                </div>
                {[{icon:'speed',label:'Response Time',val:'< 4 Hours'},{icon:'bolt',label:'Response Rate',val:'98%'},{icon:'task_alt',label:'On-time',val:'96%'}].map(s=>(
                  <div key={s.icon} style={{display:'flex',alignItems:'center',gap:'0.5rem',borderLeft:`1px solid rgba(68,71,77,0.2)`,paddingLeft:'2rem'}}>
                    <span className="material-symbols-outlined" style={{color:C.cyan,fontSize:'1rem'}}>{s.icon}</span>
                    <span style={{color:C.muted,fontSize:'0.8rem'}}>{s.label} <span style={{color:C.white,fontWeight:700}}>{s.val}</span></span>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'0.5rem',marginBottom:'2.5rem'}}>
                <span style={{fontSize:'0.875rem',color:C.muted,marginRight:4}}>Available Ports:</span>
                {ports.map(p=><span key={p} style={{padding:'6px 16px',...glass,borderRadius:8,fontSize:'0.75rem',fontWeight:600,color:C.text}}>{p}</span>)}
              </div>
              <div style={{display:'flex',gap:'1rem',flexWrap:'wrap'}}>
                <button onClick={()=>navigate('/create-request')} style={{padding:'1rem 2.5rem',background:grad,color:'#001d35',fontFamily:M,fontWeight:800,border:'none',borderRadius:12,cursor:'pointer',...glow}}>Request Quote</button>
                <button style={{padding:'1rem 2.5rem',border:`1px solid rgba(68,71,77,0.3)`,color:C.white,fontFamily:M,fontWeight:700,borderRadius:12,background:'transparent',cursor:'pointer',transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.05)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>Save Service</button>
                <button style={{padding:'1rem',border:`1px solid rgba(68,71,77,0.3)`,color:C.white,borderRadius:12,background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.05)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <span className="material-symbols-outlined">share</span>
                </button>
              </div>
            </div>
            <div style={{position:'relative'}}>
              <div style={{position:'absolute',inset:-8,background:'linear-gradient(to top right,rgba(76,214,255,0.2),transparent)',filter:'blur(24px)',opacity:0.5,borderRadius:24,pointerEvents:'none'}}/>
              <div style={{position:'relative',height:480,borderRadius:24,overflow:'hidden',border:`1px solid rgba(68,71,77,0.2)`}}>
                <img src={HERO_IMG} alt={decodedSkill} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,#0d141d 0%,transparent 50%)'}}/>
                <button style={{position:'absolute',bottom:16,right:16,width:48,height:48,...glass,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',border:'none',cursor:'pointer',color:C.white}}>
                  <span className="material-symbols-outlined">zoom_out_map</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* MAIN GRID */}
        <section style={{padding:'2rem',display:'grid',gridTemplateColumns:'2fr 1fr',gap:'2rem'}}>
          <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>

            {/* Overview */}
            <div style={{...glass,padding:'2rem',borderRadius:24,position:'relative',overflow:'hidden',...glow}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(46,53,63,0.6)';(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(46,53,63,0.4)';(e.currentTarget as HTMLElement).style.transform='translateY(0)';}}>
              <div style={{position:'absolute',top:0,right:0,padding:'1.5rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',background:`${C.cyanCont}4d`,border:`1px solid rgba(76,214,255,0.2)`,borderRadius:12,color:C.cyan}}>
                  <span className="material-symbols-outlined" style={{fontSize:'0.9rem',fontVariationSettings:"'FILL' 1"}}>radio_button_checked</span>
                  <span style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>24x7 Support Active</span>
                </div>
              </div>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.4rem',color:C.white,margin:'0 0 1.5rem'}}>Service Overview</h3>
              <p style={{color:C.muted,lineHeight:1.8,marginBottom:'2rem',fontSize:'0.9rem'}}>Our {decodedSkill.toLowerCase()} service employs next-generation, eco-friendly robotic systems designed to maintain vessel efficiency without damaging marine coatings. Unlike traditional abrasive methods, our non-contact cavitation and soft-brush technology removes biofouling while preserving the integrity of anti-fouling paints, significantly reducing fuel consumption by up to 12%.</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'3rem'}}>
                <div>
                  <h4 style={{fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.15em',color:C.cyan,marginBottom:'1rem'}}>What's Included</h4>
                  <ul style={{listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                    {INCLUDED.map(item=>(
                      <li key={item} style={{display:'flex',alignItems:'flex-start',gap:'0.75rem',fontSize:'0.875rem',color:C.text}}>
                        <span className="material-symbols-outlined" style={{color:C.cyan,fontSize:'1.1rem',flexShrink:0}}>check_circle</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 style={{fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.15em',color:C.muted,marginBottom:'1rem',opacity:0.6}}>Not Included</h4>
                  <ul style={{listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                    {NOT_INC.map(item=>(
                      <li key={item} style={{display:'flex',alignItems:'flex-start',gap:'0.75rem',fontSize:'0.875rem',color:C.muted}}>
                        <span className="material-symbols-outlined" style={{color:'rgba(255,180,171,0.6)',fontSize:'1.1rem',flexShrink:0}}>cancel</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Vessel Compat + Technical Detail */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2rem'}}>
              <div style={{...glass,padding:'1.5rem',borderRadius:24}}>
                <h4 style={{color:C.white,fontWeight:700,marginBottom:'1rem',display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.95rem'}}>
                  <span className="material-symbols-outlined" style={{color:C.cyan}}>directions_boat</span>Vessel Compatibility
                </h4>
                <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                  {VESSEL_COMPAT.map(vc=>(
                    <div key={vc.v} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.5rem 0.75rem',background:'rgba(255,255,255,0.05)',borderRadius:8}}>
                      <span style={{fontSize:'0.875rem',color:C.text}}>{vc.v}</span>
                      <span style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',color:vc.ok?'#4ade80':'#fb923c'}}>{vc.ok?'Supported':'Inquiry Only'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{...glass,padding:'1.5rem',borderRadius:24}}>
                <h4 style={{color:C.white,fontWeight:700,marginBottom:'1rem',display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.95rem'}}>
                  <span className="material-symbols-outlined" style={{color:C.cyan}}>precision_manufacturing</span>Technical Detail
                </h4>
                <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                  <div>
                    <p style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:C.muted,margin:'0 0 4px'}}>Tools &amp; Machinery</p>
                    <p style={{fontSize:'0.875rem',color:C.text,margin:0}}>Triple-brush ROV, Scrubber Unit, Cavitation Lance</p>
                  </div>
                  <div>
                    <p style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:C.muted,margin:'0 0 4px'}}>Safety Standards</p>
                    <p style={{fontSize:'0.875rem',color:C.text,margin:0}}>IMCA D042, ISO 14001, ClassNK Certified</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Specs */}
            <div>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.4rem',color:C.white,margin:'0 0 1.5rem 0.5rem'}}>Specifications</h3>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1rem'}}>
                {SPECS.map(s=>(
                  <div key={s.k} style={{...glass,padding:'1.25rem',borderRadius:16}}>
                    <p style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',color:C.muted,margin:'0 0 4px'}}>{s.k}</p>
                    <p style={{fontWeight:600,color:s.hi?C.cyan:C.white,margin:0,fontSize:'0.9rem'}}>{s.v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Port Map */}
            <div style={{...glass,padding:'2rem',borderRadius:24}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
                <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.4rem',color:C.white,margin:0}}>Live Port Availability</h3>
                <div style={{display:'flex',gap:'1rem',fontSize:'0.75rem'}}>
                  {[{c:'#22c55e',l:'Available'},{c:'#f97316',l:'Limited'},{c:'#ef4444',l:'Fully Booked'}].map(x=>(
                    <div key={x.l} style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:x.c,display:'inline-block'}}/>{x.l}</div>
                  ))}
                </div>
              </div>
              <div style={{height:240,background:C.bgLowest,borderRadius:16,position:'relative',overflow:'hidden'}}>
                <img src={MAP_IMG} alt="Coverage Map" style={{width:'100%',height:'100%',objectFit:'cover',opacity:0.25,filter:'grayscale(1)'}}/>
                <div style={{position:'absolute',top:'50%',left:'33%',width:12,height:12,borderRadius:'50%',background:'#22c55e',transform:'translate(-50%,-50%)'}}/>
                <div style={{position:'absolute',top:'45%',right:'25%',width:12,height:12,borderRadius:'50%',background:'#f97316'}}/>
                <div style={{position:'absolute',bottom:'33%',left:'50%',width:12,height:12,borderRadius:'50%',background:'#22c55e'}}/>
                <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                  <span style={{fontWeight:700,fontSize:'1rem',backdropFilter:'blur(8px)',background:'rgba(13,20,29,0.5)',padding:'10px 24px',borderRadius:12,border:`1px solid ${C.borderV}`,color:C.muted}}>Interactive Coverage Map</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>
            {/* Provider */}
            <div style={{...glass,padding:'1.5rem',borderRadius:24,border:`1px solid rgba(76,214,255,0.2)`,transition:'background 0.3s,transform 0.3s'}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(46,53,63,0.6)';(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(46,53,63,0.4)';(e.currentTarget as HTMLElement).style.transform='translateY(0)';}}>
              <p style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.15em',color:C.cyan,margin:'0 0 1rem'}}>Primary Provider</p>
              <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1.5rem'}}>
                <div style={{width:64,height:64,background:'rgba(255,255,255,0.05)',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',border:`1px solid ${C.borderV}`,flexShrink:0}}>
                  <img src={PROV_LOGO} alt={provName} style={{width:48,height:48,objectFit:'contain'}}/>
                </div>
                <div>
                  <h4 style={{color:C.white,fontWeight:700,fontSize:'1rem',margin:'0 0 4px'}}>{provName}</h4>
                  <p style={{color:C.muted,fontSize:'0.875rem',margin:0}}>{provLoc}</p>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem',marginBottom:'1.5rem'}}>
                {[{k:'Experience',v:'15+ Years'},{k:'Jobs',v:'1.2k+ Completed'}].map(s=>(
                  <div key={s.k} style={{background:'rgba(8,15,24,0.5)',padding:'0.75rem',borderRadius:12}}>
                    <p style={{fontSize:'0.6rem',color:C.muted,textTransform:'uppercase',fontWeight:700,margin:'0 0 4px'}}>{s.k}</p>
                    <p style={{color:C.white,fontWeight:600,margin:0,fontSize:'0.875rem'}}>{s.v}</p>
                  </div>
                ))}
              </div>
              <button style={{width:'100%',padding:'0.75rem',color:C.cyan,border:`1px solid rgba(76,214,255,0.3)`,borderRadius:12,background:'transparent',fontWeight:700,fontSize:'0.875rem',cursor:'pointer',marginBottom:8,transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(76,214,255,0.1)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>View Full Profile</button>
              <button style={{width:'100%',padding:'0.75rem',color:C.muted,border:'none',background:'transparent',fontWeight:500,fontSize:'0.875rem',cursor:'pointer'}}>Message Provider</button>
            </div>

            {/* Certs */}
            <div style={{...glass,padding:'1.5rem',borderRadius:24}}>
              <h4 style={{color:C.white,fontWeight:700,margin:'0 0 1rem'}}>Certifications</h4>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>
                {CERTS.map(c=>(
                  <div key={c.label} style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem',background:'rgba(8,15,24,0.3)',borderRadius:12,border:`1px solid ${C.borderV}`}}>
                    <span className="material-symbols-outlined" style={{color:C.primary,fontSize:'1.25rem'}}>{c.icon}</span>
                    <span style={{fontSize:'0.7rem',fontWeight:700,color:C.text}}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Commercial Terms */}
            <div style={{...glass,padding:'2rem',borderRadius:24,background:'linear-gradient(135deg,rgba(0,34,44,0.5),rgba(46,53,63,0.4))',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:-40,right:-40,width:128,height:128,background:'rgba(76,214,255,0.1)',filter:'blur(24px)',borderRadius:'50%'}}/>
              <h4 style={{color:C.white,fontWeight:700,fontSize:'1.2rem',margin:'0 0 1rem'}}>Commercial Terms</h4>
              <p style={{color:C.muted,fontSize:'0.875rem',lineHeight:1.6,marginBottom:'1.5rem'}}>This is a <strong style={{color:C.white}}>Quote-based Service</strong>. Final pricing depends on port location and fouling density.</p>
              <div style={{display:'flex',flexDirection:'column',gap:'0.75rem',marginBottom:'2rem'}}>
                {[{l:'Min. Order',v:'5,000 DWT'},{l:'Cancellation',v:'24h Notice'}].map(r=>(
                  <div key={r.l} style={{display:'flex',justifyContent:'space-between',fontSize:'0.875rem'}}>
                    <span style={{color:C.muted}}>{r.l}</span><span style={{color:C.white,fontWeight:700}}>{r.v}</span>
                  </div>
                ))}
                <div style={{height:1,background:'rgba(68,71,77,0.1)'}}/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.875rem'}}>
                  <span style={{color:C.white,fontWeight:700}}>Est. Total Range</span>
                  <span style={{color:C.cyan,fontWeight:900}}>$4,200 - $18,500</span>
                </div>
              </div>
              <button onClick={()=>navigate('/create-request')} style={{width:'100%',padding:'1rem',background:grad,color:'#001d35',fontFamily:M,fontWeight:800,border:'none',borderRadius:12,cursor:'pointer',marginBottom:8,...glow}}>Request Custom Quote</button>
              <button onClick={()=>navigate('/marketplace')} style={{width:'100%',padding:'1rem',color:'rgba(255,255,255,0.8)',background:'transparent',border:'none',fontWeight:700,cursor:'pointer'}}>View Similar Services</button>
            </div>
          </div>
        </section>

        {/* REVIEWS + FAQ */}
        <section style={{padding:'2rem',display:'grid',gridTemplateColumns:'7fr 5fr',gap:'2rem'}}>
          <div>
            <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.75rem',color:C.white,margin:'0 0 2rem'}}>Client Feedback</h3>
            <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>
              {REVIEWS.map(r=>(
                <div key={r.name} style={{...glass,padding:'1.5rem',borderRadius:16,transition:'background 0.3s,transform 0.3s'}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(46,53,63,0.6)';(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(46,53,63,0.4)';(e.currentTarget as HTMLElement).style.transform='translateY(0)';}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1rem'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                      <div style={{width:40,height:40,borderRadius:'50%',background:r.bg,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,color:r.col,fontSize:'0.875rem',flexShrink:0}}>{r.ini}</div>
                      <div>
                        <h5 style={{color:C.white,fontWeight:700,fontSize:'0.875rem',margin:0}}>{r.name}</h5>
                        <p style={{color:C.muted,fontSize:'0.6rem',textTransform:'uppercase',letterSpacing:'0.12em',fontWeight:700,margin:'2px 0 0'}}>{r.role}</p>
                      </div>
                    </div>
                    <div style={{display:'flex',color:C.cyan}}>
                      {Array.from({length:r.stars}).map((_,i)=><span key={i} className="material-symbols-outlined" style={{fontSize:'0.9rem',fontVariationSettings:"'FILL' 1"}}>star</span>)}
                      {r.stars<5&&<span className="material-symbols-outlined" style={{fontSize:'0.9rem'}}>star</span>}
                    </div>
                  </div>
                  <p style={{color:C.muted,fontSize:'0.875rem',lineHeight:1.6,fontStyle:'italic',margin:'0 0 1rem'}}>{r.txt}</p>
                  <p style={{fontSize:'0.6rem',color:C.dim,fontWeight:700,margin:0}}>{r.ago}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.75rem',color:C.white,margin:'0 0 2rem'}}>Service FAQ</h3>
            <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
              {FAQS.map(f=><FaqItem key={f.q} q={f.q} a={f.a}/>)}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{padding:'0 2rem 4rem'}}>
          <div style={{position:'relative',borderRadius:40,overflow:'hidden',background:C.bgHigh,padding:'4rem',textAlign:'center',...glow,border:`1px solid ${C.borderV}`}}>
            <h2 style={{fontFamily:M,fontWeight:900,fontSize:'clamp(1.8rem,4vw,3rem)',color:C.white,margin:'0 0 1.5rem',lineHeight:1.15}}>Secure Professional {decodedSkill} Today</h2>
            <p style={{fontSize:'1.1rem',color:C.muted,marginBottom:'3rem',maxWidth:600,margin:'0 auto 3rem'}}>Receive custom quotations from verified maritime providers within hours and ensure your fleet operates at peak efficiency.</p>
            <div style={{display:'flex',justifyContent:'center',gap:'1.5rem',flexWrap:'wrap'}}>
              <button onClick={()=>navigate('/create-request')} style={{padding:'1.25rem 3rem',background:grad,color:'#001d35',fontFamily:M,fontWeight:900,border:'none',borderRadius:16,cursor:'pointer',fontSize:'1rem',...glow}}>Request Procurement Quote</button>
              <button onClick={()=>navigate('/marketplace')} style={{padding:'1.25rem 3rem',background:'rgba(255,255,255,0.05)',border:`1px solid ${C.borderV}`,color:C.white,fontFamily:M,fontWeight:900,borderRadius:16,cursor:'pointer',fontSize:'1rem',transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.1)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.05)')}>Browse Marketplace</button>
            </div>
            <div style={{marginTop:'3rem',display:'flex',justifyContent:'center',gap:'2rem',color:`${C.muted}99`,fontSize:'0.875rem',flexWrap:'wrap'}}>
              {[{icon:'verified',l:'Secure Payments'},{icon:'support_agent',l:'24/7 Global Support'},{icon:'task_alt',l:'Verified Logistics'}].map(x=>(
                <div key={x.l} style={{display:'flex',alignItems:'center',gap:6}}><span className="material-symbols-outlined" style={{fontSize:'1rem'}}>{x.icon}</span>{x.l}</div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ServiceDetails;
