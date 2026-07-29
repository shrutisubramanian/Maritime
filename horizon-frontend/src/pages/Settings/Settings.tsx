import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/* ── Design tokens ── */
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
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    smsNotifications: false,
    marketingEmails: false,
    darkMode: true,
    currency: 'USD',
    language: 'English',
  });

  const [saving, setSaving] = useState(false);

  const handleToggle = (key: keyof typeof preferences) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      alert('Settings saved successfully.');
    }, 800);
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── TOP NAV ── */}
      <header style={{
        height: 64, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Go Back
        </button>
        <button 
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '0.5rem 1.5rem', borderRadius: 8, background: C.cyan, color: '#001f28', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', transition: 'opacity 0.2s', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '3rem 2.5rem', flex: 1 }}>
        <div style={{ marginBottom: '3rem' }}>
          <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: C.white }}>Settings</h1>
          <p style={{ color: C.slate, margin: 0, fontSize: '1rem' }}>Manage your account preferences and system configurations.</p>
        </div>

        {/* ── PASSWORD & SECURITY SECTION ── */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.5rem', color: C.white, borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
            Password & Security
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: C.bgLow, padding: '1.5rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
            
            {/* Change Password */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: C.white, fontWeight: 600 }}>Change Password</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: C.slate }}>Update your account password regularly to keep your account secure.</p>
              </div>
              <button onClick={() => alert('Change Password flow triggered')} style={{ padding: '0.5rem 1.25rem', borderRadius: 8, background: C.bgCardH, color: C.cyan, fontSize: '0.875rem', fontWeight: 600, border: `1px solid ${C.cyan}40`, cursor: 'pointer' }}>
                Change Password
              </button>
            </div>

            <div style={{ height: 1, background: C.border }} />

            {/* Two-Factor Authentication */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: C.white, fontWeight: 600 }}>Two-Factor Authentication (2FA)</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: C.slate }}>Add an extra layer of security to your account.</p>
              </div>
              <div 
                onClick={() => alert('2FA Setup triggered')}
                style={{ width: 44, height: 24, background: C.bgCardH, borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                <div style={{ width: 20, height: 20, background: C.white, borderRadius: '50%', position: 'absolute', top: 2, left: 2, transition: 'left 0.2s' }} />
              </div>
            </div>

            <div style={{ height: 1, background: C.border }} />

            {/* Active Sessions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: C.white, fontWeight: 600 }}>Active Sessions</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: C.slate }}>Manage and log out of devices currently logged in to your account.</p>
              </div>
              <button onClick={() => alert('View Active Sessions')} style={{ background: 'none', border: 'none', color: C.cyan, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                Manage Sessions
              </button>
            </div>

          </div>
        </section>

        {/* ── NOTIFICATIONS SECTION ── */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.5rem', color: C.white, borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
            Notifications
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: C.bgLow, padding: '1.5rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
            
            {/* Toggle Item */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: C.white, fontWeight: 600 }}>Email Alerts</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: C.slate }}>Receive updates for quotes, messages, and order status changes.</p>
              </div>
              <div 
                onClick={() => handleToggle('emailNotifications')}
                style={{ width: 44, height: 24, background: preferences.emailNotifications ? C.cyan : C.bgCardH, borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                <div style={{ width: 20, height: 20, background: C.white, borderRadius: '50%', position: 'absolute', top: 2, left: preferences.emailNotifications ? 22 : 2, transition: 'left 0.2s' }} />
              </div>
            </div>

            <div style={{ height: 1, background: C.border, margin: '0.5rem 0' }} />

            {/* Toggle Item */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: C.white, fontWeight: 600 }}>SMS Notifications</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: C.slate }}>Get urgent alerts directly to your registered mobile device.</p>
              </div>
              <div 
                onClick={() => handleToggle('smsNotifications')}
                style={{ width: 44, height: 24, background: preferences.smsNotifications ? C.cyan : C.bgCardH, borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                <div style={{ width: 20, height: 20, background: C.white, borderRadius: '50%', position: 'absolute', top: 2, left: preferences.smsNotifications ? 22 : 2, transition: 'left 0.2s' }} />
              </div>
            </div>

            <div style={{ height: 1, background: C.border, margin: '0.5rem 0' }} />

            {/* Toggle Item */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: C.white, fontWeight: 600 }}>Marketing & Promos</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: C.slate }}>Receive offers, newsletter updates, and product announcements.</p>
              </div>
              <div 
                onClick={() => handleToggle('marketingEmails')}
                style={{ width: 44, height: 24, background: preferences.marketingEmails ? C.cyan : C.bgCardH, borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                <div style={{ width: 20, height: 20, background: C.white, borderRadius: '50%', position: 'absolute', top: 2, left: preferences.marketingEmails ? 22 : 2, transition: 'left 0.2s' }} />
              </div>
            </div>

          </div>
        </section>

        {/* ── PREFERENCES SECTION ── */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.5rem', color: C.white, borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
            Preferences
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: C.bgLow, padding: '1.5rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: C.white, fontWeight: 600 }}>Display Theme</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: C.slate }}>Toggle between light and dark mode.</p>
              </div>
              <div 
                onClick={() => handleToggle('darkMode')}
                style={{ width: 44, height: 24, background: preferences.darkMode ? C.cyan : C.bgCardH, borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                <div style={{ width: 20, height: 20, background: C.white, borderRadius: '50%', position: 'absolute', top: 2, left: preferences.darkMode ? 22 : 2, transition: 'left 0.2s' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: C.slate, fontWeight: 600 }}>Base Currency</label>
                <select 
                  value={preferences.currency}
                  onChange={(e) => setPreferences({ ...preferences, currency: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: C.bgCardH, border: `1px solid ${C.border}`, color: C.white, borderRadius: 8, outline: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="SGD">SGD (S$)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: C.slate, fontWeight: 600 }}>Language</label>
                <select 
                  value={preferences.language}
                  onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem 1rem', background: C.bgCardH, border: `1px solid ${C.border}`, color: C.white, borderRadius: 8, outline: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="Mandarin">Mandarin</option>
                </select>
              </div>
            </div>

          </div>
        </section>

        {/* ── DANGER ZONE ── */}
        <section>
          <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.5rem', color: C.error, borderBottom: `1px solid rgba(255,180,171,0.2)`, paddingBottom: '0.75rem' }}>
            Danger Zone
          </h2>
          <div style={{ background: 'rgba(255,180,171,0.05)', padding: '1.5rem', borderRadius: 16, border: `1px solid rgba(255,180,171,0.2)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: C.white, fontWeight: 600 }}>Deactivate Account</h4>
              <p style={{ margin: 0, fontSize: '0.875rem', color: C.slate }}>Temporarily disable your profile and listings.</p>
            </div>
            <button style={{ padding: '0.5rem 1.25rem', borderRadius: 8, background: 'transparent', color: C.error, fontSize: '0.875rem', fontWeight: 700, border: `1px solid rgba(255,180,171,0.5)`, cursor: 'pointer' }}>
              Deactivate
            </button>
          </div>
        </section>

      </main>
    </div>
  );
};
