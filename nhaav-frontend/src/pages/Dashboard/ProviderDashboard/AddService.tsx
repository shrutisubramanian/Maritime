import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ProviderSidebar } from "../../../components/ProviderSidebar";
import { INDIAN_PORTS } from "../../../constants/ports";
import { useServiceCatalogue } from "../../../hooks/useServiceCatalogue";
import { servicesApi, ServiceListing, ServiceListingInput } from "../../../services/servicesApi";

const C = {
  bg: 'var(--color-background)',
  bgCard: 'var(--color-surface)',
  bgLowest: 'var(--color-surface-alt)',
  border: 'var(--color-border)',
  borderV: 'var(--color-border-strong)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  dim: 'var(--color-faint)',
  cyan: 'var(--color-brand)',
  terCont: 'var(--color-brand-tint-solid)',
  primary: 'var(--color-brand)',
  error: 'var(--color-error)',
  green: 'var(--color-success)',
};

const M = "Manrope,sans-serif", I = "Inter,sans-serif";

const lbl: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: C.muted,
  display: "block",
  marginBottom: "0.5rem",
};

const inp: React.CSSProperties = {
  width: "100%",
  background: C.bgLowest,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "0.75rem 1rem",
  fontSize: "0.95rem",
  color: C.text,
  fontFamily: I,
  outline: "none",
  boxSizing: "border-box",
};

export const AddService: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { service?: ServiceListing } };
  const existing = location.state?.service;
  const { groups, loading: catalogueLoading, error: catalogueError } = useServiceCatalogue();

  // Providers no longer create service listings: what they show on the
  // marketplace is their company profile's Main Category. This page survives
  // only as the edit form for a listing that already exists, so opening it
  // without one sends them back to their listings.
  useEffect(() => {
    if (!existing) navigate('/provider/services', { replace: true });
  }, [existing, navigate]);

  const [category, setCategory] = useState(existing?.category || "");
  const [serviceName, setServiceName] = useState(existing?.service_id || existing?.name || "");
  const [portValue, setPortValue] = useState(existing?.port_id || INDIAN_PORTS[0].value);
  const [pricingModel, setPricingModel] = useState(existing?.pricing_model || "Quotation Based");
  // Entered in RUPEES for the provider's convenience, stored as integer paise.
  const [priceRupees, setPriceRupees] = useState(
    existing?.price_paise != null ? String(existing.price_paise / 100) : ""
  );
  const [priceNote, setPriceNote] = useState(existing?.price_note || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [certificationsText, setCertificationsText] = useState((existing?.certifications_required || []).join(", "));
  // A listing goes straight into admin review unless the provider deliberately
  // unticks this: a silent draft would never reach the marketplace.
  const [submitNow, setSubmitNow] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fill the form from the shared catalogue once it arrives, while preserving
  // the values of an existing listing even if its category was later retired.
  useEffect(() => {
    if (!groups.length) return;
    setCategory(current => current || existing?.category || groups[0].category);
    setServiceName(current => current || existing?.service_id || existing?.name || groups[0].subServices[0] || "");
  }, [groups, existing?.category, existing?.service_id, existing?.name]);

  const subServices = groups.find(g => g.category === category)?.subServices ?? [];
  const categoryOptions = category && !groups.some(g => g.category === category)
    ? [category, ...groups.map(g => g.category)]
    : groups.map(g => g.category);
  const serviceOptions = serviceName && !subServices.includes(serviceName)
    ? [serviceName, ...subServices]
    : subServices;

  const handleCategoryChange = (next: string) => {
    setCategory(next);
    const first = groups.find(g => g.category === next)?.subServices[0];
    if (first) setServiceName(first);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category.trim() || !serviceName.trim()) {
      setError("Please choose the service category and specific service you provide.");
      return;
    }
    if (catalogueLoading || catalogueError) {
      setError(catalogueError || "The service catalogue is still loading. Please retry in a moment.");
      return;
    }

    const priceText = priceRupees.trim();
    const priceNumber = priceText === "" ? null : Number(priceText);
    if (priceNumber !== null && (!Number.isFinite(priceNumber) || priceNumber < 0)) {
      setError("Enter the listed price as a positive rupee amount, or leave it blank.");
      return;
    }

    const payload: ServiceListingInput = {
      name: serviceName.trim(),
      category,
      service_id: serviceName.trim(),
      port_id: portValue,
      pricing_model: pricingModel,
      // null clears a previously published figure, so the card honestly falls
      // back to "Price on request" instead of keeping a stale number.
      price_paise: priceNumber === null ? null : Math.round(priceNumber * 100),
      price_note: priceNote.trim() || null,
      description: description.trim() || undefined,
      certifications_required: certificationsText.split(",").map(c => c.trim()).filter(Boolean),
    };

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      if (existing) {
        await servicesApi.updateService(existing.id, payload);
        setSuccess("Service listing updated.");
      } else {
        await servicesApi.createService({ ...payload, submit_now: submitNow });
        setSuccess(submitNow ? "Service submitted for review." : "Service saved as a draft.");
      }
      navigate("/provider/services");
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "Failed to save the service listing. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: I }}>
      <ProviderSidebar activePath="/add-service" />
      <main style={{ marginLeft: "var(--sidebar-width, 256px)", padding: "2.5rem 2rem 5rem", maxWidth: 900, transition: "margin-left 0.25s" }}>
        <h1 style={{ fontFamily: M, fontWeight: 800, fontSize: "2rem", margin: "0 0 0.35rem" }}>
          Edit Service Listing
        </h1>
        <p style={{ color: C.muted, margin: "0 0 2rem" }}>
          Publish a service + port you can cover. Approved listings appear in the Service Marketplace and are matched to client requests.
        </p>

        {error && <p style={{ color: C.error, marginBottom: "1rem" }}>{error}</p>}
        {catalogueError && <p style={{ color: C.error, marginBottom: "1rem" }}>{catalogueError}</p>}
        {success && <p style={{ color: C.green, marginBottom: "1rem" }}>{success}</p>}

        <form onSubmit={handleSubmit} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: "2rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
          <div>
            <label style={lbl}>Service Category *</label>
            <select style={inp} value={category} disabled={catalogueLoading || Boolean(catalogueError)} onChange={e => handleCategoryChange(e.target.value)}>
              {catalogueLoading && <option value="">Loading service categories…</option>}
              {categoryOptions.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Specific Service *</label>
            <select style={inp} value={serviceName} disabled={catalogueLoading || Boolean(catalogueError)} onChange={e => setServiceName(e.target.value)}>
              {catalogueLoading && <option value="">Loading services…</option>}
              {serviceOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Port Served *</label>
            <select style={inp} value={portValue} onChange={e => setPortValue(e.target.value)}>
              {INDIAN_PORTS.map(p => <option key={p.id} value={p.value}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Pricing Model</label>
            <select style={inp} value={pricingModel} onChange={e => setPricingModel(e.target.value)}>
              <option value="Quotation Based">Quotation Based</option>
              <option value="Fixed Rate">Fixed Rate</option>
              <option value="Hourly Rate">Hourly Rate</option>
            </select>
          </div>

          <div>
            <label style={lbl}>Listed Price (₹)</label>
            <input
              style={inp}
              type="number"
              min="0"
              step="1"
              value={priceRupees}
              onChange={e => setPriceRupees(e.target.value)}
              placeholder="e.g. 45000"
            />
            <p style={{ fontSize: "0.72rem", color: C.dim, margin: "0.4rem 0 0" }}>
              Shown on your marketplace card. Leave blank to display “Price on request”.
            </p>
          </div>

          <div>
            <label style={lbl}>Price Note</label>
            <input
              style={inp}
              value={priceNote}
              onChange={e => setPriceNote(e.target.value)}
              placeholder="per survey / per day / per unit"
            />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, minHeight: 100, resize: "vertical" }} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Describe the scope, equipment and response capability you offer for this service." />
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Certifications Required (comma separated)</label>
            <input style={inp} value={certificationsText} onChange={e => setCertificationsText(e.target.value)} placeholder="e.g. Class-approved welder, ISM" />
          </div>

          {!existing && (
            <label style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: C.text }}>
              <input type="checkbox" checked={submitNow} onChange={e => setSubmitNow(e.target.checked)} />
              Submit for review now (uncheck to keep a private draft)
            </label>
          )}

          <div style={{ gridColumn: "span 2", display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button type="button" onClick={() => navigate("/provider/services")} style={{ padding: "0.75rem 1.5rem", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || catalogueLoading || Boolean(catalogueError)} style={{ padding: "0.75rem 2rem", borderRadius: 10, border: "none", background: C.primary, color: "var(--color-on-brand)", fontWeight: 800, cursor: saving ? "wait" : "pointer", opacity: saving || catalogueLoading || Boolean(catalogueError) ? 0.7 : 1 }}>
              {saving ? "Saving…" : existing ? "Save Changes" : "Create Listing"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default AddService;
