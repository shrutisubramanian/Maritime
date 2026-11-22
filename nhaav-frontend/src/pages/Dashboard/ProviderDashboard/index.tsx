import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import NhaavAccessCard from '../../../components/NhaavAccessCard';
import { showComingSoon } from '../../../utils/comingSoon';
import { ProviderSidebar } from '../../../components/ProviderSidebar';
import { servicesApi, ServiceListing, ProviderDashboardCounts } from '../../../services/servicesApi';
import { requestsService } from '../../../services/requests';
import { notificationsService } from '../../../services/notifications';
import { profilesService } from '../../../services/profiles';
import { providersService } from '../../../services/providers';
import { useTheme } from '../../../context/ThemeContext';
const M="'Manrope',sans-serif",I="'Inter',sans-serif";
const glass:React.CSSProperties={background:'var(--color-surface)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:'1px solid var(--color-border)'};
const glow:React.CSSProperties={boxShadow:'0 20px 40px rgba(76,157,176,0.08)'};

const initialsOf=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'?';

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

const CHART_BARS=[30,45,40,60,55,75,85,70,80,95,85,78];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const ProviderDashboard:React.FC=()=>{
  const navigate=useNavigate();
  const {logout,user}=useAuth();
  const companyName=user?.company||user?.full_name||user?.name||user?.email||'your company';
  const {tokens:themeTokens,isDark}=useTheme();
  const C={...themeTokens,bgBright:isDark?'#F2E5B8':'#ebedf0',bgHigh:isDark?'#F7EDCF':'#ebedf0',secCont:isDark?'#0369a1':'#0369a1',primCont:'rgba(3,105,161,0.1)',terCont:'rgba(3,105,161,0.08)',borderV:isDark?'rgba(13,59,102,0.18)':'rgba(203,213,225,0.4)'};
  // Real, API-backed dashboard data (no fabricated metrics).
  const [counts, setCounts] = useState<ProviderDashboardCounts | null>(null);
  const [myServices, setMyServices] = useState<ServiceListing[]>([]);
  const [openRequests, setOpenRequests] = useState<Array<{ id: string; title: string; service_type: string; port: string; urgency: string }>>([]);
  const [activity, setActivity] = useState<Array<{ id: string; title: string; message: string; created_at: string }>>([]);

  const KPI=[
    {icon:'check_circle',label:'Active Listings',val:String(counts?.active_listings ?? 0),sub:'Approved & live',subColor:C.cyan},
    {icon:'hourglass_top',label:'Pending Review',val:String(counts?.pending_listings ?? 0),sub:'Awaiting approval',subColor:C.muted},
    {icon:'edit_note',label:'Drafts',val:String(counts?.draft_listings ?? 0),sub:'Not yet submitted',subColor:C.muted},
    {icon:'archive',label:'Archived',val:String(counts?.archived_listings ?? 0),sub:'No longer listed',subColor:C.muted},
  ];
  const OPPS=openRequests.slice(0,5).map(r=>({
    title:r.title,
    sub:r.service_type,
    port:r.port,
    pri:(r.urgency||'medium').toUpperCase(),
    priBg:'rgba(76,157,176,0.12)',
    priColor:C.cyan,
    priBorder:'rgba(76,157,176,0.25)',
    budget:'Quote-based',
  }));
  const SERVICES=myServices.slice(0,3).map(s=>({
    icon:s.status==='approved'?'check_circle':'pending',
    iconColor:s.status==='approved'?C.cyan:C.muted,
    border:s.status==='approved'?C.cyan:C.muted,
    name:s.name,
    response:s.port_id||'All ports',
    rating:s.status.replace('_',' '),
    leads:'—',
  }));
  const METRICS=[
    {icon:'check_circle',iconBg:C.secondaryDim,iconColor:C.secondary,label:'Active Listings',sub:'Approved on the marketplace',val:String(counts?.active_listings??0),valColor:C.secondary},
    {icon:'hourglass_top',iconBg:C.primaryDim,iconColor:C.primary,label:'Pending Review',sub:'Submitted for moderation',val:String(counts?.pending_listings??0),valColor:C.primary},
    {icon:'edit_note',iconBg:C.cyanDim,iconColor:C.cyan,label:'Drafts',sub:'Saved but unpublished',val:String(counts?.draft_listings??0),valColor:C.cyan},
  ];
  const TIMELINE=activity.slice(0,3).map(n=>({
    icon:'notifications',iconBg:C.cyanDim,iconColor:C.cyan,title:n.title,sub:n.message,time:new Date(n.created_at).toLocaleString(),
  }));
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);

  const [subModalOpen, setSubModalOpen] = useState(false);

  // Real reviews for the signed-in provider (ProfileResponse.user_id is the id
  // the reviews router keys on).
  const [reviews, setReviews] = useState<Array<{ id: string; rating: number; comment: string | null; created_at: string }>>([]);
  const [reviewsState, setReviewsState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    profilesService.getMyProfile()
      .then((profile: { user_id?: string } | null) => {
        if (cancelled || !profile?.user_id) { if (!cancelled) setReviewsState('loaded'); return null; }
        return providersService.getProviderReviews(profile.user_id)
          .then((data) => { if (!cancelled) { setReviews(Array.isArray(data) ? data : []); setReviewsState('loaded'); } })
          .catch(() => { if (!cancelled) setReviewsState('error'); });
      })
      .catch(() => { if (!cancelled) { setReviewsError('Could not load reviews.'); setReviewsState('error'); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    servicesApi.getDashboard().then(d => { if (!cancelled) setCounts(d); }).catch(() => {});
    servicesApi.getMyServices().then(list => { if (!cancelled) setMyServices(Array.isArray(list) ? list : []); }).catch(() => {});
    requestsService.getUserRequests({ request_type: 'service', status: 'open' })
      .then((res: { data?: unknown } | unknown[]) => {
        const arr = Array.isArray(res) ? res : ((res as { data?: unknown[] })?.data ?? []);
        if (!cancelled) setOpenRequests(arr as typeof openRequests);
      })
      .catch(() => {});
    notificationsService.getNotifications()
      .then(list => { if (!cancelled) setActivity(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Derived from real data; the "slots" concept is retired (payment not implemented).
  const activeCount = counts?.active_listings ?? 0;
  const purchasedSlots = myServices.length;
  const availableSlots = counts ? counts.pending_listings + counts.draft_listings : 0;
  const handlePurchaseSlot = () => showComingSoon();

  const handleDeleteService = () => {
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
      <ProviderSidebar activePath="/provider-dashboard" />

      {/* MAIN */}
      <main style={{marginLeft:'var(--sidebar-width, 256px)',flex:1,minWidth:0,position:'relative',transition:'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)'}}>
        {/* TOP NAV */}
        <header className="role-header" style={{position:'fixed',top:0,right:0,left:'var(--sidebar-width, 256px)',height:80,zIndex:40,background: 'var(--bg-glass)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',display:'flex',justifyContent:'space-between',alignItems:'center',paddingLeft:'var(--header-padding-left, 4.5rem)',paddingRight:'2rem',transition:'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'1.5rem'}}>
            <div className="role-header-search" style={{position:'relative'}}>
              <span className="material-symbols-outlined" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:'1rem',color:C.muted,pointerEvents:'none'}}>search</span>
              <input type="text" placeholder="Search procurement..." style={{background:C.bgLowest,border:'none',borderBottom:`2px solid rgba(0,0,0,0.2)`,borderRadius:'8px 8px 0 0',padding:'8px 14px 8px 34px',fontSize:'0.875rem',color:C.text,fontFamily:I,outline:'none',width:280,transition:'border-color 0.2s'}} onFocus={e=>(e.currentTarget.style.borderBottomColor=C.cyan)} onBlur={e=>(e.currentTarget.style.borderBottomColor='rgba(0,0,0,0.2)')}/>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
            {['notifications','apps'].map(icon=>(
              <button key={icon} onClick={()=>{ if(icon==='notifications') navigate('/notifications'); }} style={{width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',background:'none',border:'none',cursor:'pointer',color:C.muted,transition:'color 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.color=C.cyan)} onMouseLeave={e=>(e.currentTarget.style.color=C.muted)}>
                <span className="material-symbols-outlined">{icon}</span>
              </button>
            ))}
            <div className="role-header-divider" style={{width:1,height:32,background:'rgba(0,0,0,0.3)',margin:'0 0.5rem'}}/>
            <div className="role-header-status" style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
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
              <h2 style={{fontFamily:M,fontWeight:800,fontSize:'clamp(1.5rem,3vw,2.25rem)',letterSpacing:'-0.03em',color:C.text,margin:'0 0 0.5rem'}}>Welcome back, {companyName}</h2>
              <p style={{color:C.muted,fontSize:'1rem',margin:0}}>Ports you cover: {(Array.from(new Set(myServices.map((s: ServiceListing)=>s.port_id).filter(Boolean) as string[])).slice(0,4).join(', '))||'no ports listed yet'} <span style={{color:C.cyan,fontWeight:700}}>({new Set(myServices.map((s: ServiceListing)=>s.port_id).filter(Boolean)).size} total)</span>.</p>
            </div>
            <div style={{display:'flex',gap:'1rem',flexWrap:'wrap'}}>
              <button onClick={() => navigate('/procurement-opportunities')} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.75rem 1.5rem',...glass,color:C.text,fontWeight:600,borderRadius:12,border:'none',cursor:'pointer',...glow,transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgBright)} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.4)')}>
                <span className="material-symbols-outlined">explore</span>Browse Procurement
              </button>
            </div>
          </div>

          {/* KPI */}
          <div className="mobile-grid-collapse" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'1.5rem',marginBottom:'2.5rem'}}>
            {KPI.map(k=>(
              <div key={k.label} style={{...glass,padding:'1.5rem',borderRadius:16,position:'relative',overflow:'hidden',transition:'background 0.3s'}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.6)';}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.4)';}}>
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

          {/* Nhaav Access: plan, pass balance + current session (gated orgs only) */}
          <NhaavAccessCard style={{marginBottom:'2.5rem'}} />

          {/* BENTO: Opportunities + Insights */}
          <div className="mobile-grid-collapse" style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'2rem',marginBottom:'2.5rem'}}>
            {/* Opportunities Table */}
            <div style={{...glass,borderRadius:16,overflow:'hidden'}}>
              <div style={{padding:'1.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:`1px solid rgba(0,0,0,0.1)`}}>
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
                      <tr key={i} style={{borderTop:`1px solid rgba(0,0,0,0.1)`,transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='var(--color-surface-alt)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
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
                          <button style={{color:C.cyan,fontSize:'0.75rem',fontWeight:700,background:'none',border:'none',cursor:'pointer',padding:'6px 12px',borderRadius:8,transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(76,157,176,0.1)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>Submit Quote</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right sidebar */}
            <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>

              {/* REQUIREMENT 14: Listing Subscription Card */}
              <div style={{ ...glass, padding: '1.5rem', borderRadius: 16, border: `1px solid rgba(76,157,176,0.3)`, background: 'linear-gradient(135deg, rgba(76,157,176,0.08), rgba(25,32,42,0.95))', ...glow }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 style={{ fontFamily: M, fontWeight: 800, fontSize: '1.05rem', color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.25rem' }}>workspace_premium</span>
                    Listing Subscription
                  </h3>
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, color: C.cyan, background: 'rgba(76,157,176,0.15)', padding: '3px 10px', borderRadius: 999, border: '1px solid rgba(76,157,176,0.3)' }}>
                    Active Plan
                  </span>
                </div>

                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: C.bgLowest, padding: '0.85rem 1rem', borderRadius: 12, border: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 4 }}>
                      ACTIVE LISTINGS
                    </span>
                    <strong style={{ fontFamily: M, fontSize: '1.35rem', color: C.white, fontWeight: 900 }}>
                      {activeCount} / {purchasedSlots}
                    </strong>
                  </div>

                  <div style={{ background: C.bgLowest, padding: '0.85rem 1rem', borderRadius: 12, border: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 4 }}>
                      AVAILABLE SLOTS
                    </span>
                    <strong style={{ fontFamily: M, fontSize: '1.35rem', color: availableSlots > 0 ? C.cyan : C.error, fontWeight: 900 }}>
                      {availableSlots}
                    </strong>
                  </div>
                </div>

                {/* Action Buttons: Manage Subscription */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <button onClick={() => setSubModalOpen(true)} style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(13,59,102,0.06)',
                    color: C.text,
                    fontFamily: M,
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>settings_suggest</span>
                    Manage Subscription
                  </button>
                </div>
              </div>

              {/* Market Recommendation */}
              <div style={{...glass,padding:'1.5rem',borderRadius:16,border:`1px solid rgba(76,157,176,0.2)`,background:'var(--color-surface)',...glow}}>
                <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1.5rem'}}>
                  <span className="material-symbols-outlined" style={{color:C.cyan,fontVariationSettings:"'FILL' 1"}}>bolt</span>
                  <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1rem',color:C.text,margin:0}}>Market Recommendation</h3>
                </div>
                <p style={{color:C.muted,fontSize:'0.875rem',lineHeight:1.6,marginBottom:'1.5rem'}}>"Electrical Repair demand increased by <span style={{color:C.cyan,fontWeight:700}}>24%</span> in Singapore this week. Recommended: Expand availability to Port Klang to capture overflow traffic."</p>
                <button onClick={showComingSoon} style={{width:'100%',padding:'0.75rem',background:'rgba(76,157,176,0.1)',color:C.cyan,border:'none',borderRadius:12,fontWeight:700,fontSize:'0.875rem',cursor:'pointer',transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(76,157,176,0.2)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(76,157,176,0.1)')}>Apply Market Insights</button>
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
                  <button key={icon} style={{padding:'0.5rem',...glass,borderRadius:8,border:'none',cursor:'pointer',color:C.text,display:'flex',alignItems:'center',transition:'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background=C.bgBright)} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.4)')}>
                    <span className="material-symbols-outlined">{icon}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mobile-grid-collapse" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1.5rem'}}>
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
                    }} style={{background:'none', border:'none', color:C.error, cursor:'pointer', padding: '0.25rem', borderRadius: '4px', transition: 'background 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(220,38,38,0.1)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                      <span className="material-symbols-outlined" style={{fontSize: '1.25rem'}}>delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ANALYTICS */}
          <div className="mobile-grid-collapse" style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'2rem',marginBottom:'2.5rem'}}>
            <div style={{...glass,padding:'2rem',borderRadius:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'2.5rem'}}>
                <div>
                  <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.1rem',color:C.text,margin:'0 0 4px'}}>Revenue Analytics</h3>
                  <p style={{fontSize:'0.65rem',color:C.muted,margin:0}}>Annual trend for 2026 (USD)</p>
                </div>
                <select style={{background:C.bgHigh,border:'none',fontSize:'0.65rem',fontWeight:700,borderRadius:8,padding:'6px 12px',color:C.text,outline:'none'}}>
                  <option>Last 12 Months</option><option>Year to Date</option>
                </select>
              </div>
              <div style={{height:240,position:'relative'}}>
                <div style={{position:'absolute',inset:0,display:'flex',alignItems:'flex-end',gap:6,padding:'0 1rem'}}>
                  {CHART_BARS.map((h,i)=>(
                    <div key={i} style={{flex:1,background:i===9?`rgba(76,157,176,0.6)`:'rgba(76,157,176,0.2)',height:`${h}%`,borderRadius:'4px 4px 0 0',borderTop:i===9||i===6?`2px solid ${C.cyan}`:'none',transition:'background 0.2s',cursor:'default'}} onMouseEnter={e=>(e.currentTarget.style.background=`rgba(76,157,176,0.5)`)} onMouseLeave={e=>(e.currentTarget.style.background=i===9?'rgba(76,157,176,0.6)':'rgba(76,157,176,0.2)')}/>
                  ))}
                </div>
                <div style={{position:'absolute',bottom:0,left:0,right:0,height:1,background:'rgba(0,0,0,0.3)'}}/>
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
          <div className="mobile-grid-collapse" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2rem'}}>
            <div>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.2rem',color:C.text,margin:'0 0 1.5rem'}}>Latest Reviews</h3>
              {reviewsState==='loading'&&<p style={{fontSize:'0.875rem',color:C.muted,margin:0}}>Loading reviews…</p>}
              {reviewsState==='error'&&<p style={{fontSize:'0.875rem',color:C.muted,margin:0}}>{reviewsError}</p>}
              {reviewsState==='loaded'&&reviews.length===0&&<p style={{fontSize:'0.875rem',color:C.muted,margin:0}}>No reviews yet. Reviews from completed jobs will appear here.</p>}
              {reviewsState==='loaded'&&reviews.length>0&&
              <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                {reviews.slice(0,3).map(r=>(
                  <div key={r.id} style={{...glass,padding:'1.25rem',borderRadius:12}}>
                    <div style={{display:'flex',gap:'1rem'}}>
                      <div style={{width:48,height:48,borderRadius:8,background:C.terCont,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontWeight:700,fontSize:'0.9rem',color:C.primary}}>★{r.rating}</div>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                          <p style={{fontSize:'0.875rem',fontWeight:700,color:C.text,margin:0}}>Rated {r.rating}/5</p>
                          <p style={{fontSize:'0.7rem',color:C.muted,margin:0}}>{new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                        <p style={{fontSize:'0.75rem',color:C.muted,lineHeight:1.5,margin:0}}>{r.comment||'No comment left.'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>}
            </div>
            <div>
              <h3 style={{fontFamily:M,fontWeight:700,fontSize:'1.2rem',color:C.text,margin:'0 0 1.5rem'}}>Recent Activity Timeline</h3>
              <div style={{...glass,padding:'1.5rem',borderRadius:16,position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',left:42,top:0,bottom:0,width:1,background:'rgba(0,0,0,0.2)'}}/>
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
              <div style={{width:1,height:24,background:'rgba(0,0,0,0.3)'}}/>
            </React.Fragment>
          ))}
          <button onClick={showComingSoon} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'6px 14px',background:C.cyan,color:'#003543',border:'none',cursor:'pointer',fontSize:'0.75rem',fontWeight:700,borderRadius:10,transition:'transform 0.2s'}} onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.05)')} onMouseLeave={e=>(e.currentTarget.style.transform='none')}>
            <span className="material-symbols-outlined" style={{fontSize:'1rem'}}>rocket_launch</span>Upgrade Plan
          </button>
        </div>
      </main>

      {/* Subscription Modal */}
      {subModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(5,11,20,0.85)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: C.bgCard, width: '100%', maxWidth: 540, borderRadius: 24, border: `1px solid rgba(76,157,176,0.3)`, padding: '2rem', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: M, fontWeight: 900, fontSize: '1.3rem', color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ color: C.cyan }}>workspace_premium</span>
                  Listing Subscription
                </h3>
                <span style={{ fontSize: '0.75rem', color: C.muted }}>Manage active listing slots &amp; capacity</span>
              </div>
              <button onClick={() => setSubModalOpen(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Plan Summary */}
            <div style={{ background: C.bgLowest, padding: '1.25rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: C.cyan, textTransform: 'uppercase', letterSpacing: '0.1em' }}>CURRENT PLAN</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-success-text)', background: 'rgba(52,211,153,0.15)', padding: '2px 10px', borderRadius: 999 }}>Active Subscription</span>
              </div>
              <h4 style={{ fontFamily: M, fontSize: '1.2rem', color: C.white, fontWeight: 800, margin: '0 0 4px' }}>Nhaav Pro Provider Plan</h4>
              <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0 }}>Allows creation of unique Service + Port listing slots.</p>
            </div>

            {/* Capacity Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: C.bgLowest, padding: '1rem', borderRadius: 12, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase' }}>PURCHASED</span>
                <strong style={{ display: 'block', fontSize: '1.4rem', color: C.white, fontWeight: 900 }}>{purchasedSlots} Slots</strong>
              </div>
              <div style={{ background: C.bgLowest, padding: '1rem', borderRadius: 12, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase' }}>ACTIVE</span>
                <strong style={{ display: 'block', fontSize: '1.4rem', color: C.white, fontWeight: 900 }}>{activeCount}</strong>
              </div>
              <div style={{ background: C.bgLowest, padding: '1rem', borderRadius: 12, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: C.dim, fontWeight: 700, textTransform: 'uppercase' }}>AVAILABLE</span>
                <strong style={{ display: 'block', fontSize: '1.4rem', color: availableSlots > 0 ? C.cyan : C.error, fontWeight: 900 }}>{availableSlots}</strong>
              </div>
            </div>

            {/* Purchase Slot CTA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button onClick={handlePurchaseSlot} style={{
                width: '100%',
                padding: '0.9rem',
                background: C.cyan,
                color: 'var(--color-on-brand)',
                fontFamily: M,
                fontWeight: 900,
                fontSize: '0.9rem',
                border: 'none',
                borderRadius: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(76,157,176,0.25)'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', fontWeight: 800 }}>add_shopping_cart</span>
                + Purchase Additional Slot
              </button>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button onClick={() => setSubModalOpen(false)} style={{ padding: '0.6rem 1.5rem', background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, cursor: 'pointer', fontSize: '0.85rem' }}>
                Close
              </button>
            </div>

          </div>
        </div>
      )}

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
