import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SupplierSidebar } from '../../../components/SupplierSidebar';
import { suppliesService, SupplyListing, SupplyListingInput } from '../../../services/supplies';
import { SUPPLY_CATEGORY_NAMES } from '../../../constants/supplies';

const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const C = {
  bg: 'var(--color-background)',
  bgCard: 'var(--color-surface)',
  bgLowest: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  error: 'var(--color-error)',
};

const lbl: React.CSSProperties = { display: 'block', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.muted, marginBottom: '0.4rem' };
const inp: React.CSSProperties = { width: '100%', background: C.bgLowest, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.65rem 0.85rem', color: C.text, fontFamily: I, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };

const parseSpecs = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  text.split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return out;
};

const specsToText = (specs?: Record<string, string> | null): string =>
  specs ? Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join('\n') : '';

export const AddListing: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { listing?: SupplyListing } };
  const existing = location.state?.listing;

  const [name, setName] = useState(existing?.name || '');
  const [category, setCategory] = useState(existing?.category || SUPPLY_CATEGORY_NAMES[0]);
  const [subcategory, setSubcategory] = useState(existing?.subcategory || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [manufacturer, setManufacturer] = useState(existing?.manufacturer || '');
  const [modelNumber, setModelNumber] = useState(existing?.model_number || '');
  const [partNumber, setPartNumber] = useState(existing?.part_number || '');
  const [condition, setCondition] = useState(existing?.condition || 'oem');
  const [countryOfOrigin, setCountryOfOrigin] = useState(existing?.country_of_origin || '');
  const [availability, setAvailability] = useState(existing?.availability || 'in_stock');
  const [leadTime, setLeadTime] = useState(existing?.lead_time || '');
  const [moq, setMoq] = useState(existing?.minimum_order_quantity?.toString() || '');
  // Entered in RUPEES for convenience; stored as integer paise.
  const [priceRupees, setPriceRupees] = useState(
    existing?.price_paise != null ? String(existing.price_paise / 100) : ''
  );
  const [priceNote, setPriceNote] = useState(existing?.price_note || '');
  const [portsText, setPortsText] = useState((existing?.ports || []).join(', '));
  const [specsText, setSpecsText] = useState(specsToText(existing?.specifications));
  // A listing goes straight into admin review unless the supplier deliberately
  // unticks this: a silent draft would never reach the marketplace.
  const [submitNow, setSubmitNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !category.trim()) {
      setError('Product name and category are required.');
      return;
    }
    const priceText = priceRupees.trim();
    const priceNumber = priceText === '' ? null : Number(priceText);
    if (priceNumber !== null && (!Number.isFinite(priceNumber) || priceNumber < 0)) {
      setError('Enter the listed price as a positive rupee amount, or leave it blank.');
      return;
    }

    const payload: SupplyListingInput = {
      name: name.trim(),
      category: category.trim(),
      subcategory: subcategory.trim() || undefined,
      description: description.trim() || undefined,
      manufacturer: manufacturer.trim() || undefined,
      model_number: modelNumber.trim() || undefined,
      part_number: partNumber.trim() || undefined,
      condition: condition || undefined,
      country_of_origin: countryOfOrigin.trim() || undefined,
      availability: availability || undefined,
      lead_time: leadTime.trim() || undefined,
      minimum_order_quantity: moq ? parseInt(moq, 10) : undefined,
      // null clears a published figure so the card falls back to "Price on request".
      price_paise: priceNumber === null ? null : Math.round(priceNumber * 100),
      price_note: priceNote.trim() || null,
      ports: portsText.split(',').map(p => p.trim()).filter(Boolean),
      specifications: Object.keys(parseSpecs(specsText)).length ? parseSpecs(specsText) : undefined,
      submit_now: existing ? undefined : submitNow,
    };
    try {
      setSaving(true);
      setError(null);
      if (existing) {
        await suppliesService.updateListing(existing.id, payload);
      } else {
        await suppliesService.createListing(payload);
      }
      navigate('/supplier/catalog');
    } catch (err) {
      console.error(err);
      setError('Failed to save the listing. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: I }}>
      <SupplierSidebar activePath="/supplier/add-listing" />
      <main style={{ marginLeft: 'var(--sidebar-width, 256px)', padding: '2.5rem 2rem 5rem', maxWidth: 900, transition: 'margin-left 0.25s' }}>
        <h1 style={{ fontFamily: M, fontWeight: 800, fontSize: '2rem', margin: '0 0 0.35rem' }}>{existing ? 'Edit Supply Listing' : 'Add Supply Listing'}</h1>
        <p style={{ color: C.muted, margin: '0 0 2rem' }}>Describe the product you can supply. Approved listings appear in the Supplies Marketplace.</p>

        {error && <p style={{ color: C.error, marginBottom: '1rem' }}>{error}</p>}

        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '1.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={lbl}>Product / Supply Name *</label>
            <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 45kVA Marine Generator" />
          </div>
          <div>
            <label style={lbl}>Category *</label>
            <select style={inp} value={category} onChange={e => setCategory(e.target.value)}>
              {SUPPLY_CATEGORY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Subcategory</label>
            <input style={inp} value={subcategory} onChange={e => setSubcategory(e.target.value)} placeholder="Optional" />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div><label style={lbl}>Manufacturer</label><input style={inp} value={manufacturer} onChange={e => setManufacturer(e.target.value)} /></div>
          <div><label style={lbl}>Model Number</label><input style={inp} value={modelNumber} onChange={e => setModelNumber(e.target.value)} /></div>
          <div><label style={lbl}>Part Number</label><input style={inp} value={partNumber} onChange={e => setPartNumber(e.target.value)} /></div>
          <div><label style={lbl}>Condition</label>
            <select style={inp} value={condition} onChange={e => setCondition(e.target.value)}>
              <option value="oem">OEM</option>
              <option value="aftermarket">Aftermarket</option>
              <option value="refurbished">Refurbished</option>
            </select>
          </div>
          <div><label style={lbl}>Country of Origin</label><input style={inp} value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} /></div>
          <div><label style={lbl}>Availability</label>
            <select style={inp} value={availability} onChange={e => setAvailability(e.target.value)}>
              <option value="in_stock">In stock</option>
              <option value="made_to_order">Made to order</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
          </div>
          <div><label style={lbl}>Lead Time</label><input style={inp} value={leadTime} onChange={e => setLeadTime(e.target.value)} placeholder="e.g. 2 weeks" /></div>
          <div><label style={lbl}>Minimum Order Quantity</label><input type="number" min="1" style={inp} value={moq} onChange={e => setMoq(e.target.value)} /></div>
          <div>
            <label style={lbl}>Listed Price (₹)</label>
            <input style={inp} type="number" min="0" step="1" value={priceRupees} onChange={e => setPriceRupees(e.target.value)} placeholder="e.g. 1250000" />
          </div>
          <div>
            <label style={lbl}>Price Note</label>
            <input style={inp} value={priceNote} onChange={e => setPriceNote(e.target.value)} placeholder="per unit / per metre" />
            <p style={{ fontSize: '0.72rem', color: C.dim, margin: '0.4rem 0 0' }}>Leave blank to display “Price on request”.</p>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={lbl}>Ports / Locations Served (comma separated)</label>
            <input style={inp} value={portsText} onChange={e => setPortsText(e.target.value)} placeholder="Mumbai Port, Nhava Sheva Port" />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={lbl}>Specifications (one "Key: value" per line)</label>
            <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={specsText} onChange={e => setSpecsText(e.target.value)} placeholder={'Power: 45 kVA\nVoltage: 415 V\nCooling: Air' } />
          </div>

          {!existing && (
            <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: C.text }}>
              <input type="checkbox" checked={submitNow} onChange={e => setSubmitNow(e.target.checked)} />
              Submit for review now (uncheck to keep a private draft)
            </label>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button onClick={() => navigate('/supplier/catalog')} style={{ padding: '0.75rem 1.5rem', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '0.75rem 2rem', borderRadius: 10, border: 'none', background: C.primary, color: 'var(--color-on-brand)', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : existing ? 'Save Changes' : 'Create Listing'}
          </button>
        </div>
      </main>
    </div>
  );
};

export default AddListing;
