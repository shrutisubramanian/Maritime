import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { profilesService, ProfileUpdateData } from '../../../services/profiles';

const C = {
  bg:        '#0d141d',
  bgCardH:   '#242a34',
  bgLow:     '#151c26',
  border:    'rgba(255,255,255,0.05)',
  text:      '#dce3f0',
  muted:     '#c4c6ce',
  slate:     '#64748b',
  cyan:      '#4cd6ff',
  dim:       '#8e9098',
  white:     '#ffffff',
  primary:   '#9ccaff',
  green:     '#22c55e',
  error:     '#ffb4ab',
  amber:     '#fbbf24',
  purple:    '#a855f7',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export const EditCompanyProfile: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState<ProfileUpdateData>({
    company_name: '',
    bio: '',
    contacts: [],
    licenses: [],
    team: [],
    offices: [],
    social_links: { linkedin: '', twitter: '', website: '' }
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const data = await profilesService.getMyProfile();
      setFormData({
        company_name: data.company_name || '',
        bio: data.bio || '',
        contacts: data.contacts || [],
        licenses: data.licenses || [],
        team: data.team || [],
        offices: data.offices || [],
        social_links: data.social_links || { linkedin: '', twitter: '', website: '' }
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await profilesService.updateMyProfile(formData);
      navigate('/success', { state: { type: 'profile_updated' } });
    } catch (err) {
      console.error(err);
      alert('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const addArrayItem = (field: keyof ProfileUpdateData, emptyItem: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: [...(prev[field] as any[] || []), emptyItem]
    }));
  };

  const removeArrayItem = (field: keyof ProfileUpdateData, index: number) => {
    setFormData(prev => {
      const arr = [...(prev[field] as any[])];
      arr.splice(index, 1);
      return { ...prev, [field]: arr };
    });
  };

  const updateArrayItem = (field: keyof ProfileUpdateData, index: number, key: string, value: any) => {
    setFormData(prev => {
      const arr = [...(prev[field] as any[])];
      if (typeof arr[index] === 'object') {
        arr[index] = { ...arr[index], [key]: value };
      } else {
        arr[index] = value;
      }
      return { ...prev, [field]: arr };
    });
  };

  const InputStyle = {
    width: '100%', padding: '0.75rem 1rem', background: C.bgCardH,
    border: `1px solid ${C.border}`, color: C.white, borderRadius: 8,
    outline: 'none', fontFamily: fonts.inter, fontSize: '0.95rem'
  };

  if (loading) return <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan }}>Loading Profile Editor...</div>;

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', paddingBottom: '4rem' }}>
      <header style={{
        height: 64, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Go Back
        </button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.5rem', borderRadius: 8, background: C.cyan, color: '#001f28', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 2.5rem' }}>
        <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: C.white }}>Company Profile</h1>
        <p style={{ color: C.slate, margin: '0 0 3rem', fontSize: '1rem' }}>This information builds your public storefront on the Horizon Marketplace.</p>

        {/* 1. Basic Info */}
        <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
          <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.5rem', color: C.white, borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: C.primary }}>domain</span> Company Information
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Company Name</label>
              <input style={InputStyle} value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} placeholder="e.g. Apex Maritime Services" />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Company Bio</label>
              <textarea style={{ ...InputStyle, minHeight: 100, resize: 'vertical' }} value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} placeholder="Describe your company's expertise..." />
            </div>
          </div>
        </section>

        {/* 2. Contacts */}
        <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
            <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: C.cyan }}>contact_mail</span> Contacts
            </h2>
            <button onClick={() => addArrayItem('contacts', { name: '', email: '', phone: '' })} style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 600, cursor: 'pointer' }}>+ Add Contact</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {formData.contacts?.map((contact, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Name" value={contact.name} onChange={e => updateArrayItem('contacts', i, 'name', e.target.value)} />
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Email" value={contact.email} onChange={e => updateArrayItem('contacts', i, 'email', e.target.value)} />
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Phone" value={contact.phone} onChange={e => updateArrayItem('contacts', i, 'phone', e.target.value)} />
                <button onClick={() => removeArrayItem('contacts', i)} style={{ background: 'none', border: 'none', color: C.error, cursor: 'pointer', padding: 8 }}><span className="material-symbols-outlined">delete</span></button>
              </div>
            ))}
            {!formData.contacts?.length && <div style={{ color: C.slate, fontSize: '0.875rem' }}>No contacts added.</div>}
          </div>
        </section>

        {/* 3. Team */}
        <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
            <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: C.purple }}>groups</span> Core Team
            </h2>
            <button onClick={() => addArrayItem('team', { name: '', role: '' })} style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 600, cursor: 'pointer' }}>+ Add Member</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {formData.team?.map((member, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Member Name" value={member.name} onChange={e => updateArrayItem('team', i, 'name', e.target.value)} />
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Role / Position" value={member.role} onChange={e => updateArrayItem('team', i, 'role', e.target.value)} />
                <button onClick={() => removeArrayItem('team', i)} style={{ background: 'none', border: 'none', color: C.error, cursor: 'pointer', padding: 8 }}><span className="material-symbols-outlined">delete</span></button>
              </div>
            ))}
            {!formData.team?.length && <div style={{ color: C.slate, fontSize: '0.875rem' }}>No team members listed.</div>}
          </div>
        </section>

        {/* 4. Offices & Licenses */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          
          <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
              <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.amber }}>location_on</span> Offices
              </h2>
              <button onClick={() => addArrayItem('offices', '')} style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {formData.offices?.map((office, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input style={{ ...InputStyle, flex: 1 }} placeholder="City, Country" value={office} onChange={e => updateArrayItem('offices', i, '', e.target.value)} />
                  <button onClick={() => removeArrayItem('offices', i)} style={{ background: 'none', border: 'none', color: C.error, cursor: 'pointer', padding: 8 }}><span className="material-symbols-outlined">close</span></button>
                </div>
              ))}
              {!formData.offices?.length && <div style={{ color: C.slate, fontSize: '0.875rem' }}>No offices added.</div>}
            </div>
          </section>

          <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
              <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.green }}>verified</span> Licenses
              </h2>
              <button onClick={() => addArrayItem('licenses', '')} style={{ background: 'none', border: 'none', color: C.cyan, fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {formData.licenses?.map((license, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input style={{ ...InputStyle, flex: 1 }} placeholder="License Name/ID" value={license} onChange={e => updateArrayItem('licenses', i, '', e.target.value)} />
                  <button onClick={() => removeArrayItem('licenses', i)} style={{ background: 'none', border: 'none', color: C.error, cursor: 'pointer', padding: 8 }}><span className="material-symbols-outlined">close</span></button>
                </div>
              ))}
              {!formData.licenses?.length && <div style={{ color: C.slate, fontSize: '0.875rem' }}>No licenses added.</div>}
            </div>
          </section>

        </div>

        {/* 5. Social Links */}
        <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
          <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.5rem', color: C.white, borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: C.cyan }}>public</span> Social Links
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Website URL</label>
              <input style={InputStyle} value={formData.social_links?.website} onChange={e => setFormData({ ...formData, social_links: { ...formData.social_links, website: e.target.value }})} placeholder="https://" />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>LinkedIn</label>
              <input style={InputStyle} value={formData.social_links?.linkedin} onChange={e => setFormData({ ...formData, social_links: { ...formData.social_links, linkedin: e.target.value }})} placeholder="https://linkedin.com/company/..." />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Twitter / X</label>
              <input style={InputStyle} value={formData.social_links?.twitter} onChange={e => setFormData({ ...formData, social_links: { ...formData.social_links, twitter: e.target.value }})} placeholder="https://twitter.com/..." />
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};
