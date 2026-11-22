import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  profilesService,
  ProfileUpdateData,
  BrochureMeta,
  ExcelImportValues,
  MAX_BROCHURE_BYTES,
} from '../../../services/profiles';
import { ExcelProfileImport } from '../../../components/ExcelProfileImport';
import { buildExcelImportPayload } from '../../../components/excelImportPayload';
import { portsService, PortOption, portLabel } from '../../../services/ports';
import { MarketplaceVisibilityCard } from '../../../components/MarketplaceVisibilityCard';
import { companiesService, VendorCategory } from '../../../services/companies';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { useAuth } from '../../../hooks/useAuth';

const C = {
  bg:        'var(--color-background)',
  bgCardH:   'var(--color-surface)',
  bgLow:     'var(--color-surface-alt)',
  border:    'var(--color-border)',
  text:      'var(--color-text)',
  muted:     'var(--color-muted)',
  slate:     'var(--color-muted)',
  cyan: 'var(--color-brand)',
  dim:       'var(--color-faint)',
  white:     'var(--color-text)',
  primary: 'var(--color-brand)',
  green:     'var(--color-success)',
  error:     'var(--color-error)',
  amber:     'var(--color-warning)',
  purple:    '#a855f7',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export const EditCompanyProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Only vendors have a marketplace taxonomy; clients never see this section.
  const vendorType = user?.role === 'supplier' ? 'supplier' : user?.role === 'provider' ? 'provider' : null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Company-first taxonomy: ONE primary category, many capabilities beneath it.
  const [categories, setCategories] = useState<VendorCategory[]>([]);
  const [primaryCategory, setPrimaryCategory] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  // Other whole business categories the company also works in (e.g. Ship
  // Chandlers + Paints). Descriptive only: discovery still uses the primary.
  const [additionalCategories, setAdditionalCategories] = useState<string[]>([]);
  // Filters the capability chips below the primary category, so a provider with
  // dozens of options can type a word instead of scanning the list.
  const [capabilityQuery, setCapabilityQuery] = useState('');
  const [categoryError, setCategoryError] = useState('');
  
  const [formData, setFormData] = useState<ProfileUpdateData>({
    company_name: '',
    bio: '',
    contacts: [],
    licenses: [],
    team: [],
    offices: [],
    social_links: { linkedin: '', twitter: '', website: '' },
    head_office: '',
    country: '',
    ports_served: [],
    service_areas: [],
    // Registration number and registered address live here, as the profile
    // page exposes them (they have no column of their own on the model).
    profile_metadata: {},
  });

  // The sheet's "Company Type" is the account role, which Nhaav controls.
  const accountTypeLabel =
    user?.role === 'supplier' ? 'Supplier'
      : user?.role === 'provider' ? 'Service Provider'
        : '';

  // Head-office port catalogue (admin-extended in the database).
  const [ports, setPorts] = useState<PortOption[]>([]);
  const [brochure, setBrochure] = useState<BrochureMeta | null>(null);
  const [uploadingBrochure, setUploadingBrochure] = useState(false);
  const [brochureError, setBrochureError] = useState('');
  // The Excel importer is an optional shortcut shown above the manual form; it
  // never replaces or hides the fields themselves.
  const [showExcelImport, setShowExcelImport] = useState(true);

  useEffect(() => {
    fetchProfile();
    portsService.list().then(setPorts).catch(() => setPorts([]));
  }, []);

  // The taxonomy depends on the signed-in vendor's role, which may be restored
  // after the first render, so it is loaded when the role becomes known.
  useEffect(() => {
    if (!vendorType) return;
    companiesService
      .getVendorCategories(vendorType)
      .then(res => setCategories(res.data || []))
      .catch(() => setCategoryError('Could not load the marketplace categories. Please retry.'));
  }, [vendorType]);

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
        social_links: data.social_links || { linkedin: '', twitter: '', website: '' },
        head_office: data.head_office || '',
        country: data.country || '',
        ports_served: data.ports_served || [],
        service_areas: data.service_areas || [],
        profile_metadata: data.profile_metadata || {},
      });
      setPrimaryCategory(data.primary_category_name || '');
      setCapabilities(data.subcategory_names || []);
      const storedAdditional = (data.profile_metadata || {}).additional_categories;
      setAdditionalCategories(Array.isArray(storedAdditional) ? storedAdditional as string[] : []);
      setBrochure(
        data.brochure_filename
          ? {
              filename: data.brochure_filename,
              size_bytes: data.brochure_size_bytes ?? null,
              uploaded_at: data.brochure_uploaded_at ?? null,
            }
          : null
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const payload: ProfileUpdateData = { ...formData };
      // Only send the taxonomy when a category is actually selected: omitting
      // the field leaves an existing assignment untouched, while sending it
      // null would clear the company's category and capabilities.
      if (vendorType && primaryCategory) {
        payload.primary_category = primaryCategory;
        payload.subcategories = capabilities;
        payload.additional_categories = additionalCategories;
      }
      await profilesService.updateMyProfile(payload);
      navigate('/success', { state: { type: 'profile_updated' } });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setSaveError(
        typeof detail === 'string'
          ? detail
          : detail?.message || 'Failed to update the profile. Please check the highlighted fields.'
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * Applies reviewed Excel values through the SAME profile update used by the
   * manual form, merging into the current values so nothing outside the
   * imported fields is changed.
   */
  const handleExcelImportConfirm = async (values: ExcelImportValues) => {
    await profilesService.updateMyProfile(buildExcelImportPayload(values, formData));
    // Refresh the manual form so the imported values are visible and editable.
    await fetchProfile();
  };

  const togglePort = (name: string) => {
    setFormData((prev) => {
      const current = prev.ports_served || [];
      const next = current.includes(name)
        ? current.filter((p) => p !== name)
        : [...current, name];
      return { ...prev, ports_served: next };
    });
  };

  const handleBrochure = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBrochureError('');
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setBrochureError('The brochure must be a PDF file.');
      return;
    }
    if (file.size > MAX_BROCHURE_BYTES) {
      setBrochureError('The brochure must be 15 MB or smaller.');
      return;
    }
    setUploadingBrochure(true);
    try {
      const res = await profilesService.uploadBrochure(file);
      setBrochure(res.brochure);
    } catch (err: any) {
      setBrochureError(
        err?.response?.data?.detail?.message ||
          'Could not upload the brochure. Please try again.'
      );
    } finally {
      setUploadingBrochure(false);
    }
  };

  const handleRemoveBrochure = async () => {
    setUploadingBrochure(true);
    setBrochureError('');
    try {
      await profilesService.removeBrochure();
      setBrochure(null);
    } catch {
      setBrochureError('Could not remove the brochure. Please try again.');
    } finally {
      setUploadingBrochure(false);
    }
  };

  const formatMb = (bytes: number | null) =>
    bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : '';

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
        height: 64, background: 'var(--bg-glass)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Go Back
        </button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.5rem', borderRadius: 8, background: C.cyan, color: 'var(--color-on-brand)', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 2.5rem' }}>
        <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: C.white }}>Company Profile</h1>
        <p style={{ color: C.slate, margin: '0 0 3rem', fontSize: '1rem' }}>This information builds your public storefront on the Nhaav Marketplace.</p>

        {/* Optional Excel shortcut. The manual form below is always available. */}
        {showExcelImport ? (
          <ExcelProfileImport
            onUseManual={() => setShowExcelImport(false)}
            onConfirm={handleExcelImportConfirm}
          />
        ) : (
          <p style={{ margin: '0 0 2rem', fontSize: '0.85rem' }}>
            <button
              type="button"
              onClick={() => setShowExcelImport(true)}
              style={{ background: 'none', border: 'none', padding: 0, color: C.cyan, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Complete your profile using Excel
            </button>{' '}
            <span style={{ color: C.slate }}>— upload your company details and we&apos;ll fill your profile for you.</span>
          </p>
        )}

        {/* Paid COMPANY-PROFILE visibility (₹1,000 / 1 month or ₹10,000 / 12
            months + GST). Separate from the profile content below and from the
            legacy per-listing showcase fees. */}
        <MarketplaceVisibilityCard />

        {saveError && (
          <div style={{ padding: '0.9rem 1.1rem', borderRadius: 12, border: `1px solid ${C.error}`, background: 'transparent', color: C.error, fontSize: '0.86rem', fontWeight: 600, marginBottom: '1.5rem' }}>
            {saveError}
          </div>
        )}

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
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Company Registration Number</label>
              <input
                style={InputStyle}
                value={(formData.profile_metadata?.regNumber as string) || ''}
                onChange={e => setFormData({
                  ...formData,
                  profile_metadata: { ...(formData.profile_metadata || {}), regNumber: e.target.value },
                })}
                placeholder="e.g. U12345MH2015PTC123456"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Registered Address</label>
              <input
                style={InputStyle}
                value={(formData.profile_metadata?.address as string) || ''}
                onChange={e => setFormData({
                  ...formData,
                  profile_metadata: { ...(formData.profile_metadata || {}), address: e.target.value },
                })}
                placeholder="e.g. Unit 5, Harbour Road, Mumbai 400001"
              />
            </div>
            {accountTypeLabel && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Company Type</label>
                <div style={{ ...InputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', color: C.slate }}>
                  <span>{accountTypeLabel}</span>
                  <span style={{ fontSize: '0.76rem', color: C.slate }}>Set by Nhaav — ask us to change it</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 1b. Marketplace category & capabilities (company-first model) */}
        {vendorType && (
          <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
            <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem', color: C.white, borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: C.primary }}>category</span> Marketplace Category & Capabilities
            </h2>
            <p style={{ color: C.slate, fontSize: '0.85rem', margin: '0.75rem 0 1.5rem' }}>
              Choose the main category that best describes your business — it is the only category you are listed under on the marketplace.
              Add everything else you offer as subcategories below: they do not change how you are categorised, but buyers can see them on your profile when they open it.
            </p>

            <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Primary business category *</label>
            <SearchableSelect
              options={categories.map(c => c.name)}
              value={primaryCategory}
              ariaLabel="Primary business category"
              placeholder="Type to search your primary category…"
              emptyLabel="No category matches that search"
              inputStyle={InputStyle}
              onChange={next => {
                // Capabilities belong to a category, so switching categories
                // clears them here exactly as the server does on save. The
                // company's services and supplies are not touched.
                setPrimaryCategory(next);
                setCapabilities([]);
                setCapabilityQuery('');
                setSaveError('');
              }}
            />
            {categoryError && (
              <p style={{ color: C.error, fontSize: '0.82rem', margin: '0.5rem 0 0' }}>{categoryError}</p>
            )}

            {(() => {
              const selected = categories.find(c => c.name === primaryCategory);
              if (!selected) return null;
              return (
                <div style={{ marginTop: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.6rem', color: C.slate, fontSize: '0.875rem' }}>
                    Capabilities under {selected.name}
                  </label>
                  <input
                    value={capabilityQuery}
                    onChange={e => setCapabilityQuery(e.target.value)}
                    placeholder="Type to search these capabilities…"
                    aria-label={`Search capabilities under ${selected.name}`}
                    style={{ ...InputStyle, marginBottom: '0.75rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {selected.subcategories
                      .filter(sub => sub.name.toLowerCase().includes(capabilityQuery.trim().toLowerCase()))
                      .map(sub => {
                      const on = capabilities.includes(sub.name);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setCapabilities(prev => on ? prev.filter(n => n !== sub.name) : [...prev, sub.name])}
                          style={{
                            padding: '5px 11px', borderRadius: 999,
                            border: `1px solid ${on ? C.primary : C.border}`,
                            background: on ? 'var(--color-brand-tint)' : 'transparent',
                            color: on ? C.text : C.slate,
                            fontSize: '0.78rem', fontWeight: on ? 700 : 500, cursor: 'pointer',
                          }}
                        >
                          {sub.name}
                        </button>
                      );
                    })}
                  </div>
                  {capabilityQuery.trim() !== '' &&
                    selected.subcategories.every(sub => !sub.name.toLowerCase().includes(capabilityQuery.trim().toLowerCase())) && (
                      <p style={{ color: C.dim, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                        Nothing under {selected.name} matches “{capabilityQuery.trim()}”.
                        {(() => {
                          const q = capabilityQuery.trim().toLowerCase();
                          const elsewhere = categories
                            .filter(c => c.name !== selected.name && c.subcategories.some(s => s.name.toLowerCase().includes(q)))
                            .map(c => c.name);
                          return elsewhere.length
                            ? ` It exists under ${elsewhere.join(', ')} — switch your primary category to add it.`
                            : ' Check the spelling, or ask Nhaav to add it during verification.';
                        })()}
                      </p>
                    )}
                  {selected.subcategories.length === 0 && (
                    <p style={{ color: C.dim, fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                      No capabilities are defined for this category yet. Nhaav can add them during verification.
                    </p>
                  )}
                  {capabilities.length > 0 && (
                    <p style={{ color: C.dim, fontSize: '0.76rem', margin: '0.6rem 0 0' }}>
                      {capabilities.length} capabilit{capabilities.length === 1 ? 'y' : 'ies'} selected.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Other business categories: descriptive only, never discovery. */}
            <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: `1px solid ${C.border}` }}>
              <label style={{ display: 'block', marginBottom: '0.35rem', color: C.slate, fontSize: '0.875rem' }}>
                Other business categories (optional)
              </label>
              <p style={{ color: C.slate, fontSize: '0.82rem', margin: '0 0 0.75rem' }}>
                Also work in more than one line of business? Add up to five. They are shown on your public
                profile, but you are still listed on the marketplace under your primary category only.
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {categories
                  .filter(c => c.name !== primaryCategory)
                  .map(c => {
                    const on = additionalCategories.includes(c.name);
                    const atLimit = additionalCategories.length >= 5 && !on;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={atLimit}
                        onClick={() => setAdditionalCategories(prev => on
                          ? prev.filter(n => n !== c.name)
                          : [...prev, c.name])}
                        style={{
                          padding: '5px 11px', borderRadius: 999,
                          border: `1px solid ${on ? C.primary : C.border}`,
                          background: on ? 'var(--color-brand-tint)' : 'transparent',
                          color: on ? C.text : C.slate,
                          fontSize: '0.78rem', fontWeight: on ? 700 : 500,
                          cursor: atLimit ? 'not-allowed' : 'pointer',
                          opacity: atLimit ? 0.55 : 1,
                        }}
                      >
                        {c.name}
                      </button>
                    );
                  })}
              </div>
              {additionalCategories.length >= 5 && (
                <p style={{ color: C.dim, fontSize: '0.76rem', margin: '0.6rem 0 0' }}>
                  Five other categories selected — that is the limit.
                </p>
              )}
            </div>

            <p style={{ color: C.dim, fontSize: '0.76rem', margin: '1rem 0 0' }}>
              Changing your primary category clears the capabilities listed under the previous one. Your existing
              services and supplies stay on your profile and are not deleted.
            </p>
          </section>
        )}

        {/* 2. Contacts */}
        <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
            <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: C.cyan }}>contact_mail</span> Contacts
            </h2>
            <button onClick={() => addArrayItem('contacts', { name: '', email: '', phone: '' })} style={{ background: 'none', border: 'none', color: C.text, fontWeight: 700, cursor: 'pointer' }}>+ Add Contact</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {formData.contacts?.map((contact, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Name" value={contact.name} onChange={e => updateArrayItem('contacts', i, 'name', e.target.value)} />
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Email" value={contact.email} onChange={e => updateArrayItem('contacts', i, 'email', e.target.value)} />
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Phone" value={contact.phone} onChange={e => updateArrayItem('contacts', i, 'phone', e.target.value)} />
                <button onClick={() => removeArrayItem('contacts', i)} style={{ background: 'var(--color-error-tint)', border: 'none', borderRadius: 999, color: 'var(--color-error-text)', cursor: 'pointer', padding: 8, display: 'inline-flex' }}><span className="material-symbols-outlined">delete</span></button>
              </div>
            ))}
            {!formData.contacts?.length && <div style={{ color: C.slate, fontSize: '0.875rem' }}>No contacts added.</div>}
          </div>
        </section>

        {/* 3. Team */}
        <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
            <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: C.text }}>groups</span> Core Team
            </h2>
            <button onClick={() => addArrayItem('team', { name: '', role: '' })} style={{ background: 'none', border: 'none', color: C.text, fontWeight: 700, cursor: 'pointer' }}>+ Add Member</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {formData.team?.map((member, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Member Name" value={member.name} onChange={e => updateArrayItem('team', i, 'name', e.target.value)} />
                <input style={{ ...InputStyle, flex: 1 }} placeholder="Role / Position" value={member.role} onChange={e => updateArrayItem('team', i, 'role', e.target.value)} />
                <button onClick={() => removeArrayItem('team', i)} style={{ background: 'var(--color-error-tint)', border: 'none', borderRadius: 999, color: 'var(--color-error-text)', cursor: 'pointer', padding: 8, display: 'inline-flex' }}><span className="material-symbols-outlined">delete</span></button>
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
                <span className="material-symbols-outlined" style={{ color: C.text }}>location_on</span> Offices
              </h2>
              <button onClick={() => addArrayItem('offices', '')} style={{ background: 'none', border: 'none', color: C.text, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {formData.offices?.map((office, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input style={{ ...InputStyle, flex: 1 }} placeholder="City, Country" value={office} onChange={e => updateArrayItem('offices', i, '', e.target.value)} />
                  <button onClick={() => removeArrayItem('offices', i)} style={{ background: 'var(--color-error-tint)', border: 'none', borderRadius: 999, color: 'var(--color-error-text)', cursor: 'pointer', padding: 8, display: 'inline-flex' }}><span className="material-symbols-outlined">close</span></button>
                </div>
              ))}
              {!formData.offices?.length && <div style={{ color: C.slate, fontSize: '0.875rem' }}>No offices added.</div>}
            </div>
          </section>

          <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
              <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.text }}>verified</span> Licenses
              </h2>
              <button onClick={() => addArrayItem('licenses', '')} style={{ background: 'none', border: 'none', color: C.text, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {formData.licenses?.map((license, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input style={{ ...InputStyle, flex: 1 }} placeholder="License Name/ID" value={license} onChange={e => updateArrayItem('licenses', i, '', e.target.value)} />
                  <button onClick={() => removeArrayItem('licenses', i)} style={{ background: 'var(--color-error-tint)', border: 'none', borderRadius: 999, color: 'var(--color-error-text)', cursor: 'pointer', padding: 8, display: 'inline-flex' }}><span className="material-symbols-outlined">close</span></button>
                </div>
              ))}
              {!formData.licenses?.length && <div style={{ color: C.slate, fontSize: '0.875rem' }}>No licenses added.</div>}
            </div>
          </section>

        </div>

        {/* 5. Marketplace location */}
        <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
          <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.4rem', color: C.white, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: C.primary }}>anchor</span> Marketplace Location
          </h2>
          <p style={{ color: C.slate, fontSize: '0.85rem', margin: '0 0 1.5rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
            Your head office decides the port your company appears under in the marketplace. The other ports you work in are shown on your profile but do not create extra listings.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Head office / main port *</label>
              <select
                style={InputStyle}
                value={formData.head_office || ''}
                onChange={e => setFormData({ ...formData, head_office: e.target.value })}
              >
                <option value="">Select the port your head office is based at</option>
                {ports.map(p => (
                  <option key={p.id} value={p.name}>{portLabel(p)}</option>
                ))}
              </select>
              <p style={{ color: C.dim, fontSize: '0.76rem', margin: '0.4rem 0 0' }}>
                Missing your port? Ask Nhaav to add it during verification.
              </p>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Country</label>
              <input
                style={InputStyle}
                value={formData.country || ''}
                onChange={e => setFormData({ ...formData, country: e.target.value })}
                placeholder="e.g. India"
              />
            </div>
          </div>

          <label style={{ display: 'block', marginBottom: '0.6rem', color: C.slate, fontSize: '0.875rem' }}>
            Other ports you work in <span style={{ color: C.dim }}>(optional)</span>
          </label>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', maxHeight: 240, overflowY: 'auto', padding: '0.25rem 0' }}>
            {ports.map(p => {
              const selected = (formData.ports_served || []).includes(p.name);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePort(p.name)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 999,
                    border: `1px solid ${selected ? C.primary : C.border}`,
                    background: selected ? 'var(--color-brand-tint)' : 'transparent',
                    color: selected ? C.text : C.slate,
                    fontSize: '0.78rem',
                    fontWeight: selected ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          {(formData.ports_served || []).length > 0 && (
            <p style={{ color: C.dim, fontSize: '0.76rem', margin: '0.5rem 0 0' }}>
              {(formData.ports_served || []).length} other port{(formData.ports_served || []).length === 1 ? '' : 's'} selected.
            </p>
          )}
        </section>

        {/* 6. Company brochure */}
        <section style={{ background: C.bgLow, padding: '2rem', borderRadius: 16, border: `1px solid ${C.border}`, marginBottom: '2rem' }}>
          <h2 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.4rem', color: C.white, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: C.cyan }}>picture_as_pdf</span> Company Brochure
          </h2>
          <p style={{ color: C.slate, fontSize: '0.85rem', margin: '0 0 1.25rem', borderBottom: `1px solid ${C.border}`, paddingBottom: '0.75rem' }}>
            Attach one PDF (up to 15 MB) with anything you want buyers to know — capabilities, certificates, fleet, references. It appears on your company profile as a download.
          </p>

          {brochure ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '0.9rem 1rem', borderRadius: 10, background: C.bgCardH, border: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontWeight: 700, color: C.white, fontSize: '0.9rem' }}>{brochure.filename}</div>
                <div style={{ color: C.dim, fontSize: '0.78rem' }}>{formatMb(brochure.size_bytes)}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <label style={{ cursor: uploadingBrochure ? 'not-allowed' : 'pointer', color: C.text, fontWeight: 700, fontSize: '0.85rem' }}>
                  Replace
                  <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} disabled={uploadingBrochure} onChange={e => handleBrochure(e.target.files)} />
                </label>
                <button type="button" onClick={handleRemoveBrochure} disabled={uploadingBrochure} style={{ background: 'none', border: 'none', color: C.error, fontWeight: 700, fontSize: '0.85rem', cursor: uploadingBrochure ? 'not-allowed' : 'pointer', padding: 0 }}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label style={{ display: 'block', padding: '1.5rem', borderRadius: 10, border: `1px dashed ${C.border}`, textAlign: 'center', color: C.slate, fontSize: '0.88rem', cursor: uploadingBrochure ? 'not-allowed' : 'pointer' }}>
              {uploadingBrochure ? 'Uploading…' : 'Choose a PDF to attach (max 15 MB)'}
              <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} disabled={uploadingBrochure} onChange={e => handleBrochure(e.target.files)} />
            </label>
          )}
          {brochureError && (
            <p style={{ color: C.error, fontSize: '0.82rem', margin: '0.75rem 0 0' }}>{brochureError}</p>
          )}
        </section>

        {/* 7. Social Links */}
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
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Facebook</label>
              <input style={InputStyle} value={formData.social_links?.facebook} onChange={e => setFormData({ ...formData, social_links: { ...formData.social_links, facebook: e.target.value }})} placeholder="https://facebook.com/..." />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: C.slate, fontSize: '0.875rem' }}>Instagram</label>
              <input style={InputStyle} value={formData.social_links?.instagram} onChange={e => setFormData({ ...formData, social_links: { ...formData.social_links, instagram: e.target.value }})} placeholder="https://instagram.com/..." />
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};
