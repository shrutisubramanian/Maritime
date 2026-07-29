import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import { showComingSoon } from '../../../utils/comingSoon';

const C = {
  bg:'#0d141d',bgCard:'#19202a',bgCardH:'#242a34',bgHigh:'#2e353f',
  bgBright:'#333a44',bgLowest:'#080f18',bgLow:'#151c26',
  border:'rgba(68,71,77,0.1)',borderV:'rgba(142,144,152,0.1)',
  text:'#dce3f0',muted:'#c4c6ce',dim:'#8e9098',
  cyan:'#4cd6ff',primary:'#9ccaff',secondary:'#a6c9fa',
  secCont:'#244872',primCont:'#00203a',terCont:'#00222c',
  error:'#ffb4ab',errCont:'#93000a',white:'#ffffff',
};
const M="'Manrope',sans-serif",I="'Inter',sans-serif";
const glass:React.CSSProperties={background:'rgba(46,53,63,0.4)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:'1px solid rgba(255,255,255,0.05)'};
const glow:React.CSSProperties={boxShadow:'0 20px 40px rgba(0,209,255,0.08)'};

const PROF_IMG='https://lh3.googleusercontent.com/aida-public/AB6AXuCyxMyoo63-eOnmqec66Mpuqy8ckYuVCRH1bMQTHWH7P_1Ox8HQOlakjAYCp1VlxgmJ59fRVYCIRHUrXqJyxizYpQ_oux-XvgGc2wCZ2jPw6fWH_n9l97uiVrgxEv0NZd1k1IL0BPgA9DU38jLof0kAVbWDjHEjZ7EtVbuhvGAyz_Z3AGkjQkTpC1eAmn8QZkEt7B99szIXuVpYeCezNJEKtfr-wCK679LYyeFIM1kuTEt_Gz4w5v6fjLc9aP1vTPqkO5HYd5VYrOu-';
const REV1='https://lh3.googleusercontent.com/aida-public/AB6AXuA1AnfWME7NBVylPI6tO4YFjX-QPR1KQLarNtbygaMBRrW5TQV9X1ZAzTfuEicJyrOVJAaW59CTHtV87GFlFNWrRkj-KHRRq_UAUZe7Kgu7ye3XOU7CAQ95EIYUa_Bl0e6XyGK8YnDaytve1C-TsW1mcWCbGZZs0hWfav14ojlMb773CGdVX0dA3h2pTvnSgwQWKWQZmnoB-86oCYTLf1AoKu-uiTbShTxXj19Z-EbQdlQCUb0ebOChYS9bCY-GdyCQ34cyNVCJgXFb';
const REV2='https://lh3.googleusercontent.com/aida-public/AB6AXuBgj49cpgT1oui9x0ZQM5U0k9gagFavvduzkUCX7pt40oUNgUqQuXnwXZYdl_sWxTIvEamY4GbAW-Yit6Eb0aSVU0HaZ_nH_wnD3BVGF9_WOuT5MzTk3BdUdwOXQzktmkynGrHDoo5DgvR52K8kvxj3qS2_6euV6J3ocmhH2vpaxEYcJ4WjD2GmKI3Z3nNfGwKyLc5d2j00pbeZmCRptKT_l2lIvgFoXi8b_z3TprqP0rwUOFPi2H8t6DXZUWPJTPMFcga0NdhvuJcN';

const NAV_MAIN=[
  {icon:'dashboard',label:'Dashboard',active:true,path:'/provider-dashboard'},
  {icon:'sailing',label:'My Services',path:'/provider/services'},
  {icon:'hail',label:'Procurement Opportunities',path:'/procurement-opportunities'},
  {icon:'request_quote',label:'My Quotations',path:'/my-quotations'},
  {icon:'anchor',label:'Active Jobs',path:'/jobs'},
  {icon:'task',label:'Completed Jobs',path:'/jobs'},
  {icon:'description',label:'Documents',path:'/verification'},
];
const NAV_SYS=[
  {icon:'person',label:'Profile',path:'/provider/me'},
  {icon:'settings',label:'Settings',path:'/settings'},
];

const KPI=[
  {icon:'request_quote',label:'New Procurement Requests',val:'32',sub:'+12% this week',subColor:C.cyan},
  {icon:'hourglass_top',label:'Pending Quotations',val:'18',sub:'Awaiting response',subColor:C.muted},
  {icon:'anchor',label:'Active Jobs',val:'11',sub:'In progress',subColor:C.muted},
  {icon:'payments',label:'Monthly Revenue',val:'$148,000',sub:'+18% vs last month',subColor:C.cyan},
];

const OPPS=[
  {title:'Emergency Hull Cleaning',sub:'Vessel: MV Horizon Star',port:'Singapore',pri:'CRITICAL',priBg:'rgba(147,0,10,0.4)',priColor:C.error,priBorder:`rgba(255,180,171,0.2)`,budget:'$12,000 - $15,000'},
  {title:'Propeller Polishing',sub:'Fleet: Neptune Logistics',port:'Rotterdam',pri:'HIGH',priBg:`${C.secCont}66`,priColor:C.secondary,priBorder:`rgba(166,201,250,0.2)`,budget:'$8,500 - $10,000'},
  {title:'Underwater Survey (UWILD)',sub:'Classification: ABS',port:'Jebel Ali',pri:'MEDIUM',priBg:'rgba(46,53,63,0.6)',priColor:C.muted,priBorder:`${C.border}`,budget:'$5,000 - $7,000'},
];

const SERVICES=[
  {icon:'scuba_diving',iconColor:C.cyan,border:C.cyan,name:'Hull Cleaning',response:'14 mins',rating:'4.9',leads:'142'},
  {icon:'build',iconColor:C.secondary,border:C.secondary,name:'Propeller Repair',response:'28 mins',rating:'4.8',leads:'89'},
  {icon:'visibility',iconColor:C.primary,border:C.primary,name:'Underwater Inspection',response:'18 mins',rating:'5.0',leads:'215'},
];

const METRICS=[
  {icon:'speed',iconBg:'rgba(76,214,255,0.1)',iconColor:C.cyan,label:'Response Rate',sub:'Global avg: 82%',val:'98%',valColor:C.cyan},
  {icon:'check_circle',iconBg:'rgba(166,201,250,0.1)',iconColor:C.secondary,label:'Quote Acceptance',sub:'Global avg: 61%',val:'72%',valColor:C.secondary},
  {icon:'group',iconBg:'rgba(156,202,255,0.1)',iconColor:C.primary,label:'Repeat Clients',sub:'Global avg: 34%',val:'45%',valColor:C.primary},
];

const TIMELINE=[
  {icon:'edit_note',iconBg:'rgba(76,214,255,0.2)',iconColor:C.cyan,title:'New Quote Submitted',sub:'Emergency Hull Cleaning - MV Horizon Star',time:'2 hours ago'},
  {icon:'check_circle',iconBg:'rgba(166,201,250,0.2)',iconColor:C.secondary,title:'Verification Document Approved',sub:'Class Certificate ABS #88219',time:'5 hours ago'},
  {icon:'payments',iconBg:'rgba(156,202,255,0.2)',iconColor:C.primary,title:'Payment Received',sub:'Invoice #OC-2024-012 ($12,400)',time:'Yesterday'},
];

const CHART_BARS=[30,45,40,60,55,75,85,70,80,95,85,78];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const ProviderDashboard:React.FC=()=>{
  const navigate=useNavigate();
  const {logout}=useAuth();
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);

  const handleDeleteService = () => {
    // Mock delete
    setDeleteModalOpen(false);
    navigate('/success', { state: { type: 'default', title: 'Service Deleted', subtitle: 'The service has been removed from the marketplace.', actionText: 'Back to Dashboard', actionPath: '/dashboard' }});
  };

  const navLink=(item:{icon:string;label:string;path:string;active?:boolean})=>(
    <a key={item.label} href="#" onClick={e=>{e.preventDefault();navigate(item.path);}}
      style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem 1.5rem',borderRadius:'0 999px 999px 0',textDecoration:'none',color:item.active?C.primary:C.muted,background:item.active?C.bgCardH:'transparent',fontWeight:item.active?700:400,transform:item.active?'scale(0.97)':'none',transition:'all 0.2s'}}
      onMouseEnter={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background=C.bgBright;(e.currentTarget as HTMLElement).style.color=C.text;}}}
      onMouseLeave={e=>{if(!item.active){(e.currentTarget as HTMLElement).style.background='transparent';(e.currentTarget as HTMLElement).style.color=C.muted;}}}>
      <span className="material-symbols-outlined" style={{fontSize:'1.2rem'}}>{item.icon}</span>
      <span style={{fontFamily:I,fontSize:'0.875rem'}}>{item.label}</span>
    </a>
  );

  return(
    <div style={{display:'flex',minHeight:'100vh',background:C.bg,color:C.text,fontFamily:I}}>

      {/* SIDE NAV */}
      <aside style={{width:288,flexShrink:0,position:'fixed',left:0,top:0,bottom:0,background:C.bgLow,display:'flex',flexDirection:'column',paddingTop:'2rem',zIndex:50,overflowY:'auto'}}>
        <div style={{padding:'0 2rem',marginBottom:'2.5rem'}}>
          <h1 style={{fontFamily:M,fontWeight:700,fontSize:'1.1rem',color:C.primary,letterSpacing:'-0.03em',margin:0}}>Horizon Maritime</h1>
          <p style={{fontSize:'0.55rem',textTransform:'uppercase',letterSpacing:'0.2em',color:C.muted,margin:'4px 0 0',fontWeight:600}}>Service Provider Portal</p>
        </div>
        <nav style={{flex:1,display:'flex',flexDirection:'column',gap:2,overflowY:'auto',paddingRight:8}}>
          {NAV_MAIN.map(navLink)}
          <div style={{marginTop:'2rem',paddingTop:'2rem',borderTop:`1px solid rgba(68,71,77,0.1)`}}>
            {NAV_SYS.map(navLink)}
          </div>
        </nav>
        <div style={{padding:'1rem 1.5rem 2rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem',...glass,borderRadius:12}}>
            <img src={PROF_IMG} alt="Profile" style={{width:40,height:40,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
            <div style={{overflow:'hidden'}}>
              <p style={{fontSize:'0.875rem',fontWeight:700,color:C.text,margin:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>OceanTech Marine</p>
              <p style={{fontSize:'0.75rem',color:C.muted,margin:0}}>Admin Account</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{marginLeft:288,flex:1,position:'relative'}}>
        {/* TOP NAV */}
        <header style={{position:'fixed',top:0,right:0,left:288,height:80,zIndex:40,background:'rgba(13,20,29,0.4)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 2rem',transition:'all 0.3s'}}>
          <div style={{display:'flex',alignItems:'center',gap:'1.5rem'}}>
            <div style={{position:'relative'}}>
              <span className="material-symbols-outlined" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:'1rem',color:C.muted,pointerEvents:'none'}}>search</span>
              <input type="text" placeholder="Search procurement..." style={{background:C.bgLowest,border:'none',borderBottom:`2px solid rgba(68,71,77,0.2)`,borderRadius:'8px 8px 0 0',padding:'8px 14px 8px 34px',fontSize:'0.875rem',color:C.text,fontFamily:I,outline:'none',width:280,transition:'border-color 0.2s'}} onFocus={e=>(e.currentTarget.style.borderBottomColor=C.cyan)} onBlur={e=>(e.currentTarget.style.borderBottomColor='rgba(68,71,77,0.2)')}/>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
            {['notifications','apps'].map(icon=>(
              <button key={icon} style={{width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',background:'none',border:'none',cursor:'pointer',color:C.muted,transition:'color 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.color=C.cyan)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>
                <span className="material-symbols-outlined">{icon}</span>
              </button>
            ))}
            <div style={{width:1,height:32,background:'rgba(68,71,77,0.3)',margin:'0 0.5rem'}}/>
            <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:C.cyan}}/>
              <span style={{fontSize:'0.65rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',color:C.muted}}>System Online</span>
            </div>
          </div>
        </header>

        {/* BODY */}
        <div style={{paddingTop:112,padding:'112px 2.5rem 5rem',position:'relative',zIndex:10}}>

          {/* HERO */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:'2.5rem',flexWrap:'wrap',gap:'1rem'}}>
            <div>
              <h2 style={{fontFamily:M,fontWeight:800,fontSize:'clamp(1.5rem,3vw,2.25rem)',letterSpacing:'-0.03em',color:C.text,margin:'0 0 0.5rem'}}>Welcome back, OceanTech Marine Services</h2>
              <p style={{color:C.muted,fontSize:'1rem',margin:0}}>Provide verified maritime services across <span style={{color:C.cyan,fontWeight:700}}>18 global ports</span>.</p>
            </div>
            <div style={{display:'flex',gap:'1rem'}}>
              <button onClick={() => navigate('/procurement-opportunities')} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.75rem 1.5rem',...glass,color:C.text,fontWeight:600,borderRadius:12,border:'none',cursor:'pointer',...glow,transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgBright)} onMouseLeave={e=>(e.currentTarget.style.background='rgba(46,53,63,0.4)')}>
                <span className="material-symbols-outlined">explore</span>Browse Procurement
              </button>
              <button onClick={() => navigate('/add-service')} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.75rem 1.5rem',background:'linear-gradient(135deg,#008be1,#4cd6ff)',color:'#001d35',fontWeight:700,borderRadius:12,border:'none',cursor:'pointer',boxShadow:'0 8px 24px rgba(76,214,255,0.2)',transition:'transform 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.05)')} onMouseLeave={e=>(e.currentTarget.style.transform='none')}>
                <span className="material-symbols-outlined">add_circle</span>Add New Service
              </button>
            </div>
          </div>

          {/* KPI */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1.5rem',marginBottom:'2.5rem'}}>
            {KPI.map(k=>(
              <div key={k.label} style={{...glass,padding:'1.5rem',borderRadius:16,position:'relative',overflow:'hidden',transition:'background 0.3s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(46,53,63,0.6)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(46,53,63,0.4)';}}>
                <div style={{position:'absolute',right:-16,bottom:-16,opacity:0.05}}>
                  <span className="material-symbols-outlined" style={{fontSize:'5rem',fontVariationSettings:"'FILL' 1"}}>{k.icon}</span>
                </div>
                <p style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:C.muted,margin:'0 0 1rem'}}>{k.label}</p>
                <div style={{display:'flex',alignItems:'flex-end',gap:'0.75rem'}}>
                  <span style={{fontFamily:M,fontWeight:700,fontSize:'2.25rem',color:C.text,lineHeight:1}}>{k.val}</span>
                  <span style={{fontSize:'0.8rem',fontWeight:600,color:k.subColor,marginBottom:4}}>{k.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* BENTO: Opportunities + Insights */}
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'2rem',marginBottom:'2.5rem'}}>
            {/* Opportunities Table */}
            <div style={{...glass,borderRadius:16,overflow:'hidden'}}>
              <div style={{padding:'1.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:`1px solid rgba(68,71,77,0.1)`}}>
                <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.1rem',color:C.text,margin:0}}>Procurement Opportunities</h3>
                <button onClick={() => navigate('/procurement-opportunities')} style={{color:C.cyan,fontSize:'0.75rem',fontWeight:600,background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4}} onMouseEnter={e=>(e.currentTarget.style.textDecoration='underline')} onMouseLeave={e=>(e.currentTarget.style.textDecoration='none')}>
                  View All <span className="material-symbols-outlined" style={{fontSize:'0.75rem'}}>arrow_forward</span>
                </button>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
                  <thead>
                    <tr style={{background:C.bgLowest,fontSize:'0.6rem',color:C.muted,textTransform:'uppercase',letterSpacing:'0.12em',fontWeight:700}}>
                      {['Request Title','Port','Priority','Budget Est.','Actions'].map((h,i)=>(
                        <th key={h} style={{padding:'1rem 1.5rem',textAlign:i===4?'right':'left'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {OPPS.map((o,i)=>(
                      <tr key={i} style={{borderTop:`1px solid rgba(68,71,77,0.1)`,transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(51,58,68,0.2)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <td style={{padding:'1.25rem 1.5rem'}}>
                          <div style={{fontWeight:600,fontSize:'0.875rem',color:C.text}}>{o.title}</div>
                          <div style={{fontSize:'0.75rem',color:C.muted}}>{o.sub}</div>
                        </td>
                        <td style={{padding:'1.25rem 1.5rem',fontSize:'0.875rem',color:C.text}}>{o.port}</td>
                        <td style={{padding:'1.25rem 1.5rem'}}>
                          <span style={{padding:'3px 10px',background:o.priBg,color:o.priColor,border:`1px solid ${o.priBorder}`,borderRadius:999,fontSize:'0.6rem',fontWeight:700}}>{o.pri}</span>
                        </td>
                        <td style={{padding:'1.25rem 1.5rem',fontSize:'0.875rem',fontFamily:M,fontWeight:600,color:C.text}}>{o.budget}</td>
                        <td style={{padding:'1.25rem 1.5rem',textAlign:'right'}}>
                          <button style={{color:C.cyan,fontSize:'0.75rem',fontWeight:700,background:'none',border:'none',cursor:'pointer',padding:'6px 12px',borderRadius:8,transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(76,214,255,0.1)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>Submit Quote</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right sidebar */}
            <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>
              {/* Market Recommendation */}
              <div style={{...glass,padding:'1.5rem',borderRadius:16,border:`1px solid rgba(76,214,255,0.2)`,background:'rgba(0,34,44,0.3)',...glow}}>
                <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1.5rem'}}>
                  <span className="material-symbols-outlined" style={{color:C.cyan,fontVariationSettings:"'FILL' 1"}}>bolt</span>
                  <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1rem',color:C.text,margin:0}}>Market Recommendation</h3>
                </div>
                <p style={{color:C.muted,fontSize:'0.875rem',lineHeight:1.6,marginBottom:'1.5rem'}}>"Electrical Repair demand increased by <span style={{color:C.cyan,fontWeight:700}}>24%</span> in Singapore this week. Recommended: Expand availability to Port Klang to capture overflow traffic."</p>
                <button onClick={showComingSoon} style={{width:'100%',padding:'0.75rem',background:'rgba(76,214,255,0.1)',color:C.cyan,border:'none',borderRadius:12,fontWeight:700,fontSize:'0.875rem',cursor:'pointer',transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(76,214,255,0.2)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(76,214,255,0.1)')}>Apply Market Insights</button>
              </div>

              {/* Verification Status */}
              <div style={{...glass,padding:'1.5rem',borderRadius:16}}>
                <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1rem',color:C.text,margin:'0 0 1.5rem'}}>Verification Status</h3>
                <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>
                  {[{label:'Company Verified',pct:'100%',w:'100%',color:C.cyan},{label:'Profile Completion',pct:'92%',w:'92%',color:C.secondary}].map(v=>(
                    <div key={v.label}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.65rem',fontWeight:700,marginBottom:'0.5rem'}}>
                        <span style={{textTransform:'uppercase'}}>{v.label}</span>
                        <span style={{color:v.color}}>{v.pct}</span>
                      </div>
                      <div style={{width:'100%',height:6,background:C.bgHigh,borderRadius:999,overflow:'hidden'}}>
                        <div style={{width:v.w,height:'100%',background:v.color,borderRadius:999}}/>
                      </div>
                    </div>
                  ))}
                  <div style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.75rem',background:C.bgLowest,borderRadius:10}}>
                    <span className="material-symbols-outlined" style={{color:C.error}}>warning</span>
                    <div>
                      <p style={{fontSize:'0.75rem',fontWeight:700,color:C.text,margin:0}}>ISO Certificates</p>
                      <p style={{fontSize:'0.65rem',color:C.muted,margin:0}}>Pending renewal in 12 days</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MY SERVICES */}
          <div style={{marginBottom:'2.5rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.4rem',color:C.text,margin:0}}>My Services Performance</h3>
              <div style={{display:'flex',gap:'0.5rem'}}>
                {['chevron_left','chevron_right'].map(icon=>(
                  <button key={icon} style={{padding:'0.5rem',...glass,borderRadius:8,border:'none',cursor:'pointer',color:C.text,display:'flex',alignItems:'center',transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgBright)} onMouseLeave={e=>(e.currentTarget.style.background='rgba(46,53,63,0.4)')}>
                    <span className="material-symbols-outlined">{icon}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1.5rem'}}>
              {SERVICES.map(s=>(
                <div key={s.name} style={{...glass,padding:'1.5rem',borderRadius:16,borderLeft:`4px solid ${s.border}`,transition:'transform 0.3s',cursor:'default'}} onMouseEnter={e=>(e.currentTarget.style.transform='translateY(-4px)')} onMouseLeave={e=>(e.currentTarget.style.transform='none')}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'1rem'}}>
                    <span className="material-symbols-outlined" style={{fontSize:'2rem',color:s.iconColor}}>{s.icon}</span>
                    <span style={{display:'flex',alignItems:'center',gap:4,fontSize:'0.75rem',fontWeight:700,color:C.muted}}>
                      <span className="material-symbols-outlined" style={{fontSize:'0.75rem',fontVariationSettings:"'FILL' 1"}}>star</span>{s.rating}
                    </span>
                  </div>
                  <h4 style={{fontFamily:M,fontWeight:700,fontSize:'1.1rem',color:C.text,margin:'0 0 4px'}}>{s.name}</h4>
                  <p style={{fontSize:'0.75rem',color:C.muted,margin:'0 0 1.5rem'}}>Avg response: {s.response}</p>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontSize:'0.875rem'}}>
                      <span style={{color:s.iconColor,fontWeight:700}}>{s.leads}</span>
                      <span style={{color:C.muted,marginLeft:4}}>Leads this month</span>
                    </div>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      setServiceToDelete(s.name);
                      setDeleteModalOpen(true);
                    }} style={{background:'none', border:'none', color:C.error, cursor:'pointer', padding: '0.25rem', borderRadius: '4px', transition: 'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,180,171,0.1)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                      <span className="material-symbols-outlined" style={{fontSize: '1.25rem'}}>delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ANALYTICS */}
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'2rem',marginBottom:'2.5rem'}}>
            <div style={{...glass,padding:'2rem',borderRadius:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'2.5rem'}}>
                <div>
                  <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.1rem',color:C.text,margin:'0 0 4px'}}>Revenue Analytics</h3>
                  <p style={{fontSize:'0.65rem',color:C.muted,margin:0}}>Annual trend for 2024 (USD)</p>
                </div>
                <select style={{background:C.bgHigh,border:'none',fontSize:'0.65rem',fontWeight:700,borderRadius:8,padding:'6px 12px',color:C.text,outline:'none'}}>
                  <option>Last 12 Months</option><option>Year to Date</option>
                </select>
              </div>
              <div style={{height:240,position:'relative'}}>
                <div style={{position:'absolute',inset:0,display:'flex',alignItems:'flex-end',gap:6,padding:'0 1rem'}}>
                  {CHART_BARS.map((h,i)=>(
                    <div key={i} style={{flex:1,background:i===9?`rgba(76,214,255,0.6)`:'rgba(76,214,255,0.2)',height:`${h}%`,borderRadius:'4px 4px 0 0',borderTop:i===9||i===6?`2px solid ${C.cyan}`:'none',transition:'background 0.2s',cursor:'default'}} onMouseEnter={e=>(e.currentTarget.style.background=`rgba(76,214,255,0.5)`)} onMouseLeave={e=>(e.currentTarget.style.background=i===9?'rgba(76,214,255,0.6)':'rgba(76,214,255,0.2)')}/>
                  ))}
                </div>
                <div style={{position:'absolute',bottom:0,left:0,right:0,height:1,background:'rgba(68,71,77,0.3)'}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:'1rem',fontSize:'0.6rem',color:C.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>
                {MONTHS.map(m=><span key={m}>{m}</span>)}
              </div>
            </div>
            <div style={{...glass,padding:'2rem',borderRadius:16}}>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.1rem',color:C.text,margin:'0 0 2rem'}}>Business Metrics</h3>
              <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>
                {METRICS.map(m=>(
                  <div key={m.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                      <div style={{width:48,height:48,borderRadius:12,background:m.iconBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <span className="material-symbols-outlined" style={{color:m.iconColor}}>{m.icon}</span>
                      </div>
                      <div>
                        <p style={{fontSize:'0.875rem',fontWeight:700,color:C.text,margin:0}}>{m.label}</p>
                        <p style={{fontSize:'0.65rem',color:C.muted,margin:0}}>{m.sub}</p>
                      </div>
                    </div>
                    <span style={{fontFamily:M,fontWeight:800,fontSize:'1.5rem',color:m.valColor}}>{m.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* REVIEWS + TIMELINE */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2rem'}}>
            <div>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.2rem',color:C.text,margin:'0 0 1.5rem'}}>Latest Reviews</h3>
              <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                {[{img:REV1,name:'Capt. Mikhail Sokolov',stars:5,txt:'"Exceptional turnaround on the hull cleaning in Singapore. Vessel maintained schedule. Highly recommend OceanTech for their professionalism."'},
                  {img:REV2,name:'Elena Rodriguez',stars:4,txt:'"Great communication throughout the underwater inspection process. Detailed reporting and clear imagery provided."'}].map((r,i)=>(
                  <div key={i} style={{...glass,padding:'1.25rem',borderRadius:12}}>
                    <div style={{display:'flex',gap:'1rem'}}>
                      <img src={r.img} alt={r.name} style={{width:48,height:48,borderRadius:8,objectFit:'cover',flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                          <p style={{fontSize:'0.875rem',fontWeight:700,color:C.text,margin:0}}>{r.name}</p>
                          <div style={{display:'flex',color:C.cyan}}>
                            {Array.from({length:r.stars}).map((_,j)=><span key={j} className="material-symbols-outlined" style={{fontSize:'0.75rem',fontVariationSettings:"'FILL' 1"}}>star</span>)}
                            {r.stars<5&&<span className="material-symbols-outlined" style={{fontSize:'0.75rem'}}>star</span>}
                          </div>
                        </div>
                        <p style={{fontSize:'0.75rem',color:C.muted,lineHeight:1.5,margin:0}}>{r.txt}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.2rem',color:C.text,margin:'0 0 1.5rem'}}>Recent Activity Timeline</h3>
              <div style={{...glass,padding:'1.5rem',borderRadius:16,position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',left:42,top:0,bottom:0,width:1,background:'rgba(68,71,77,0.2)'}}/>
                <div style={{display:'flex',flexDirection:'column',gap:'2rem',position:'relative'}}>
                  {TIMELINE.map((t,i)=>(
                    <div key={i} style={{display:'flex',gap:'1.5rem',alignItems:'flex-start'}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:t.iconBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:`1px solid ${C.bg}`,zIndex:1}}>
                        <span className="material-symbols-outlined" style={{fontSize:'1rem',color:t.iconColor}}>{t.icon}</span>
                      </div>
                      <div>
                        <p style={{fontSize:'0.875rem',fontWeight:700,color:C.text,margin:'0 0 2px'}}>{t.title}</p>
                        <p style={{fontSize:'0.75rem',color:C.muted,margin:'0 0 4px'}}>{t.sub}</p>
                        <p style={{fontSize:'0.6rem',color:C.dim,margin:0}}>{t.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FLOATING BAR */}
        <div style={{position:'fixed',bottom:32,left:'calc(50% + 144px)',transform:'translateX(-50%)',display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem',...glass,borderRadius:16,zIndex:40,...glow}}>
          {[{icon:'support_agent',label:'Help Center'},{icon:'description',label:'Service Guide'}].map(b=>(
            <React.Fragment key={b.label}>
              <button onClick={showComingSoon} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'6px 14px',background:'none',border:'none',cursor:'pointer',fontSize:'0.75rem',fontWeight:700,color:C.text,borderRadius:10,transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgBright)} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                <span className="material-symbols-outlined" style={{fontSize:'1rem'}}>{b.icon}</span>{b.label}
              </button>
              <div style={{width:1,height:24,background:'rgba(68,71,77,0.3)'}}/>
            </React.Fragment>
          ))}
          <button onClick={showComingSoon} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'6px 14px',background:C.cyan,color:'#003543',border:'none',cursor:'pointer',fontSize:'0.75rem',fontWeight:700,borderRadius:10,transition:'transform 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.05)')} onMouseLeave={e=>(e.currentTarget.style.transform='none')}>
            <span className="material-symbols-outlined" style={{fontSize:'1rem'}}>rocket_launch</span>Upgrade Plan
          </button>
        </div>
      </main>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Delete Service"
        message={`Are you sure you want to delete "${serviceToDelete}"? It will be removed from the marketplace and clients will no longer be able to request it. This action cannot be undone.`}
        confirmText="Delete Service"
        isDestructive={true}
        onConfirm={handleDeleteService}
        onCancel={() => setDeleteModalOpen(false)}
      />

    </div>
  );
};

export default ProviderDashboard;
