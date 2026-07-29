import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { providersService } from '../../services/providers';

/* ── tokens ───────────────────────────────────────────────────── */
const T = {
  manrope: "'Manrope', sans-serif" as const,
  inter:   "'Inter', sans-serif"   as const,
  bg:      '#0d141d',
  bgLow:   '#080f18',
  bgCard:  '#19202a',
  bgCardH: '#333a44',
  bgHigh:  '#242a34',
  glass:   'rgba(46,53,63,0.4)',
  border:  'rgba(68,71,77,0.15)',
  white:   '#ffffff',
  text:    '#dce3f0',
  muted:   '#c4c6ce',
  dim:     '#8e9098',
  cyan:    '#4cd6ff',
  primary: '#9ccaff',
};

const blur = (): React.CSSProperties => ({
  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
});

/* ── service card ─────────────────────────────────────────────── */
const ServiceCard: React.FC<{ service: any }> = ({ service }) => {
  const { provider, skill } = service;
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();
  // Fallback image since the backend might not return one yet
  const img = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAXjHuACTvv_pKztKwMxzjGW1Uz_eToRv8HkrD3_DMK5RNgyOROraI-KoypH2iwl9vB3r4NoU3N-m5uR1ZyBH_e1Cdn1Hj-AAA8hXJ9QOrjO_Aezaf-Py7wRHn-gs7HaCzKfEvxVUG-S94YMGpAVAgrvigNAnZpCzN4iLuGbS6a7lfeMQaDU6ihDFHf5KZXHakzBCV0MAlKHPqjkme6A_G2OMFSlbIgdyke5M9eeTlGOiRxFbxIFVogphe54oBYQakjjGOKLjPxgB3i';

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/service/${provider.id}/${encodeURIComponent(skill)}`)}
      style={{ background: hovered ? T.bgCardH : T.bgCard, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'background 0.3s', cursor: 'pointer' }}>
      <div style={{ position: 'relative', height: 180, overflow: 'hidden' }}>
        <img src={img} alt={skill} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.08)' : 'scale(1)', transition: 'transform 0.5s' }} />
        {provider.verification_status === 'verified' && (
          <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: T.primary, borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#001d35' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '0.85rem', fontVariationSettings: "'FILL' 1" }}>verified</span>Verified
          </div>
        )}
      </div>
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <h4 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.1rem', color: T.white, margin: 0 }}>{skill}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: T.cyan, fontVariationSettings: "'FILL' 1" }}>star</span>
            <span style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '0.85rem', color: T.white }}>{provider.rating_avg > 0 ? provider.rating_avg.toFixed(1) : 'New'}</span>
          </div>
        </div>
        <div style={{ fontFamily: T.inter, fontSize: '0.85rem', color: T.cyan, marginBottom: '0.75rem' }}>
          by {provider.company_name || provider.position || 'Unknown Provider'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.muted, fontSize: '0.8rem', marginBottom: 'auto' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>location_on</span>
          {provider.ports_served?.length ? provider.ports_served.join(', ') : 'Global'}
        </div>
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: T.inter, fontSize: '0.6rem', color: T.muted, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 2 }}>Response Time</div>
            <div style={{ fontFamily: T.manrope, fontWeight: 800, fontSize: '1rem', color: T.white }}>&lt; 4 Hours</div>
          </div>
          <button style={{ padding: '0.65rem', background: hovered ? T.primary : T.bgHigh, borderRadius: 10, border: 'none', cursor: 'pointer', color: hovered ? '#001d35' : T.text, transition: 'background 0.3s, color 0.3s', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── main page ────────────────────────────────────────────────── */
const PROF_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBGogPGCU1oLCP976-ZC7xzXV43v7py8egddvPXiHzxEB96gEPzbsyxeayFCnF8_Yk4qSFg9E2kTBJBDGrktx4hZjgsphjFoGY4WQj6J9NilEtovcQuPBWrW1FNmjv7mPARY61cYNnFSkaAvteidD4-C-yv88kIKui99QvR5IQIQdQWsQpHEJYs0DR028t0R5qThFPlcz89PsGX2E-KcIk3iOvl2MLuCo2jSUznDuekugd4un4QYczoWLKV9OnPc3pCrWWP-qZqZtea';

const CATEGORIES = ['Stores & Supplies', 'Repairs & Services'];

const DUMMY_SERVICES = [
  { provider: { id: 'd1', company_name: 'OceanTech Hull Care',   verification_status: 'verified', rating_avg: 4.9, ports_served: ['Port of Rotterdam'] }, skill: 'Hull Cleaning',    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAXjHuACTvv_pKztKwMxzjGW1Uz_eToRv8HkrD3_DMK5RNgyOROraI-KoypH2iwl9vB3r4NoU3N-m5uR1ZyBH_e1Cdn1Hj-AAA8hXJ9QOrjO_Aezaf-Py7wRHn-gs7HaCzKfEvxVUG-S94YMGpAVAgrvigNAnZpCzN4iLuGbS6a7lfeMQaDU6ihDFHf5KZXHakzBCV0MAlKHPqjkme6A_G2OMFSlbIgdyke5M9eeTlGOiRxFbxIFVogphe54oBYQakjjGOKLjPxgB3i', price: 'From $1,200' },
  { provider: { id: 'd2', company_name: 'Titan Maritime Repair', verification_status: 'verified', rating_avg: 4.8, ports_served: ['Port of Singapore']  }, skill: 'Propeller Repair', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDBvjTPKU2nU-L6DeKokaQwL7ieAzh7QOodA5TEesEa81rh_r-JgMuNtyuJQhhOJ-4WgyHfthjLMrAdFKtCaCujrHt4NWnpneB320ByFUlU8JB5OmoyWEZI0noHzcbdJNPrJv3QLb88R-Y4EnbVnipLKLfNCzFIhnZKoqDGGC1-bIqV5QPWiHi8uS8r43L_Vxfw7DryuK2RtUauphAsCs9fk-MVuQFC-Jz0kUkeKDgUfaHuYlpM0ZZl-D9C6E9irrTidOnFgYgzIrJT', price: 'From $4,500' },
  { provider: { id: 'd3', company_name: 'Crest Provisions',      verification_status: 'verified', rating_avg: 4.7, ports_served: ['Port of Jebel Ali']   }, skill: 'Crew Catering',   img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD4vnt5VhkK7V2rmY8VopQvc5SUsiztJvqsvl63wZJ0DE8bK6g1KTUmIL9LtnMRJPUFGGClof8730-H6fmc5_1rOXpgXlfHaRDUDb2lZ19qQ5Ht5xWhHZSOKb58sqb19VnbHnDEPELl3efsIfe5aHexDuylPV4o37CiUqQVkmFKUlTPaJ4Xw9JDtv6nuj98gpKMYwFYCBawmlIGo3O9L0FyxZv588A_N5zy0DzYv-OYsk7uKcyl7eCuvKkfyQOYWhIoZdx_ve-71Iu1', price: 'From $850'   },
  { provider: { id: 'd4', company_name: 'Nexus Logistics',       verification_status: 'verified', rating_avg: 4.9, ports_served: ['Port of Shanghai']    }, skill: 'Cargo Logistics', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCdFPyVKg6-G7R6oNyI_xS5BzN4QFsC04Ytkx_ZpJ9sFpFmq2dQ8tuCZnHnJULNp8SSJvtm6775MGCp0ex9fK1Yfb6bxoDbMTlqXBJvdnOsrw3cCzQnkGTt46sBDjLHVRCGwlXYB2uZ1uKuLc3NxPfXbPQtMF_otdv02r8eiC8EPwCH2KzUfMPTtcCgtsIyM7ssumCLV4vmq2SCgOf6ASgjvu4BE1S6m5lg6CauThIpWqWgewGI2gKzO7xrps_vvbRS421zcTW67iDy', price: 'From $2,800' },
];

export const Marketplace: React.FC = () => {
  const navigate = useNavigate();
  const [checkedCats, setCheckedCats] = useState<string[]>(['Stores & Supplies']);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalServices, setTotalServices] = useState(0);

  // Search state
  const [searchSkill, setSearchSkill] = useState('');
  const [searchPort, setSearchPort] = useState('');

  const toggleCat = (cat: string) =>
    setCheckedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (searchSkill) filters.skill = searchSkill;
      if (searchPort) filters.port = searchPort;
      
      const res = await providersService.getProviders(filters);
      
      const flattenedServices: any[] = [];
      res.data.forEach((provider: any) => {
        if (provider.skills && provider.skills.length > 0) {
          provider.skills.forEach((skill: string) => {
            if (!searchSkill || skill.toLowerCase().includes(searchSkill.toLowerCase())) {
              flattenedServices.push({ provider, skill });
            }
          });
        } else {
          // Fallback if no specific skills listed
          flattenedServices.push({ provider, skill: 'General Service' });
        }
      });

      setServices(flattenedServices);
      setTotalServices(flattenedServices.length);
    } catch (error) {
      console.error('Failed to fetch providers', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleSearch = () => {
    fetchProviders();
  };

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: T.inter, minHeight: '100vh' }}>

      {/* ── TOP NAV ── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 72, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', background: 'rgba(15,23,36,0.55)', ...blur(), borderBottom: `1px solid ${T.border}`, boxShadow: '0 20px 40px rgba(0,209,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem' }}>
          <span style={{ fontFamily: T.manrope, fontWeight: 900, fontSize: '1.4rem', color: T.white, letterSpacing: '-0.04em' }}>HORIZON</span>
          <div style={{ display: 'flex', gap: '2rem' }}>
            {[{l:'Marketplace',active:true,path:'/marketplace'},{l:'Dashboard',active:false,path:'/ship-owner'},{l:'Create Request',active:false,path:'/create-request'}].map(({l,active,path})=>(
              <a key={l} href="#" onClick={e=>{ e.preventDefault(); navigate(path); }} style={{ fontFamily: T.manrope, fontSize: '0.85rem', letterSpacing: '-0.01em', textDecoration: 'none', color: active ? T.cyan : '#94a3b8', borderBottom: active ? `2px solid ${T.cyan}` : 'none', paddingBottom: active ? 2 : 0, cursor: 'pointer' }}>{l}</a>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted }}><span className="material-symbols-outlined">notifications</span></button>
          <img src={PROF_IMG} alt="Profile" onClick={() => navigate('/company-profile')} style={{ width: 36, height: 36, borderRadius: '50%', border: `1px solid ${T.border}`, cursor: 'pointer', objectFit: 'cover' }} />
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main style={{ paddingLeft: 0, paddingTop: 72, minHeight: '100vh' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '3rem 2.5rem' }}>

          {/* hero search */}
          <header style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: '#00222c', color: T.cyan, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '1rem' }}>
              Global Port Network
            </div>
            <h1 style={{ fontFamily: T.manrope, fontWeight: 800, fontSize: 'clamp(2rem, 4vw, 3rem)', color: T.white, letterSpacing: '-0.04em', margin: '0 0 2rem', maxWidth: 560, lineHeight: 1.1 }}>
              Find and book verified maritime services globally.
            </h1>
            {/* search bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', borderRadius: 16, background: T.glass, ...blur(), border: `1px solid ${T.border}`, boxShadow: '0 20px 40px rgba(0,0,0,0.3)', maxWidth: 860 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: T.bgLow, borderRadius: 12 }}>
                <span className="material-symbols-outlined" style={{ color: T.primary, fontSize: '1.2rem' }}>search</span>
                <input type="text" placeholder="Service or Skill (e.g. Welding, Fuel Supply)" 
                  value={searchSkill} onChange={e => setSearchSkill(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: T.text, fontFamily: T.inter, fontSize: '0.9rem', width: '100%' }} />
              </div>
              <div style={{ width: 1, height: 36, background: T.border }} />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: T.bgLow, borderRadius: 12 }}>
                <span className="material-symbols-outlined" style={{ color: T.primary, fontSize: '1.2rem' }}>location_on</span>
                <input type="text" placeholder="Port (e.g. Singapore, Rotterdam)" 
                  value={searchPort} onChange={e => setSearchPort(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: T.text, fontFamily: T.inter, fontSize: '0.9rem', width: '100%' }} />
              </div>
              <button onClick={handleSearch}
                style={{ padding: '0.85rem 2.5rem', background: T.primary, color: '#001d35', fontFamily: T.manrope, fontWeight: 700, fontSize: '0.9rem', border: 'none', borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#a6c9fa')} onMouseLeave={e => (e.currentTarget.style.background = T.primary)}>
                Search
              </button>
            </div>
          </header>

          {/* body: filters + grid */}
          <div style={{ display: 'flex', gap: '2.5rem' }}>

            {/* ── filters sidebar ── */}
            <aside style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* categories */}
              <div>
                <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '0.75rem', color: T.white, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>Categories</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {CATEGORIES.map(cat => {
                    const checked = checkedCats.includes(cat);
                    return (
                      <label key={cat} onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${checked ? T.primary : T.dim}`, background: checked ? T.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                          {checked && <span className="material-symbols-outlined" style={{ fontSize: '0.8rem', color: '#001d35', fontVariationSettings: "'FILL' 1" }}>check</span>}
                        </div>
                        <span style={{ fontSize: '0.85rem', color: checked ? T.white : T.muted, transition: 'color 0.2s' }}>{cat}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {/* rating */}
              <div>
                <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '0.75rem', color: T.white, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>Rating</h3>
                <button style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: '0.85rem', padding: 0 }}>
                  <div style={{ display: 'flex', color: T.cyan }}>
                    {[1,2,3,4].map(i=><span key={i} className="material-symbols-outlined" style={{ fontSize: '1.1rem', fontVariationSettings: "'FILL' 1" }}>star</span>)}
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>star</span>
                  </div>
                  <span>4.0 & Up</span>
                </button>
              </div>
            </aside>

            {/* ── service grid ── */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: T.muted }}>
                  Showing <span style={{ color: T.white, fontWeight: 700 }}>{totalServices} services</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', color: T.muted }}>Sort by:</span>
                  <button style={{ fontFamily: T.inter, fontSize: '0.85rem', fontWeight: 700, color: T.white, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Relevance <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>expand_more</span>
                  </button>
                </div>
              </div>
              
              {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: T.muted }}>Loading services...</div>
              ) : services.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {services.map((s, idx) => <ServiceCard key={`${s.provider.id}-${idx}`} service={s} />)}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {DUMMY_SERVICES.map((s, idx) => <ServiceCard key={`dummy-${idx}`} service={s} />)}
                </div>
              )}
            </div>

          </div>{/* end body */}
        </div>
      </main>
    </div>
  );
};
