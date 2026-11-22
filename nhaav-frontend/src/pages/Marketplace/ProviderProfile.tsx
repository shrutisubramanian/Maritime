import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { providersService } from "../../services/providers";
import { BrandLogo } from "../../components/BrandLogo";
import { profilesService } from "../../services/profiles";

/**
 * Provider Profile (/provider/:id and /provider/me).
 *
 * H9 honest-wire rework (per H9_PROVIDER_PROFILE_AUDIT.md): the previous page
 * was a fully static template with a fabricated company, a fabricated success
 * metric, a fabricated verification badge, fake reviews and stock imagery,
 * ignoring its id param entirely. Every displayed value now comes from real
 * endpoints:
 *
 *   /provider/me  -> profilesService.getMyProfile()        (GET /profiles/me)
 *   /provider/:id -> providersService.getProviderById(id)  (GET /profiles/{profile_id})
 *   reviews       -> GET /reviews/provider/{profile.user_id}
 *
 * No success-rate / response-time / completion-time claims (no such data
 * exists — H7 contract). Optional sections (licenses, offices, contacts,
 * services, ports, skills) are hidden when empty rather than shown as
 * placeholders. No new backend endpoints, no invented metrics.
 */

const C = { bg: 'var(--color-background)', bgHigh: 'var(--color-surface-deep)', bgBright: 'var(--color-surface-deep)', bgLow: 'var(--color-surface-alt)', border: 'var(--color-border)', text: 'var(--color-text)', muted: 'var(--color-muted)', dim: 'var(--color-faint)', cyan: 'var(--color-brand)', primary: 'var(--color-brand)', white: 'var(--color-text)', error: 'var(--color-error)' };
const M = "Manrope,sans-serif", I = "Inter,sans-serif";

/* Mirrors ProfileResponse (app/schemas/profile.py) — only fields the API returns. */
interface ProviderProfileData {
  id: string;
  user_id: string;
  position: string | null;
  company_name: string | null;
  bio: string | null;
  years_experience: number | null;
  ports_served: string[] | null;
  // Optional in the public profile response (private fields are never sent).
  skills?: string[] | null;
  contacts?: { [k: string]: unknown }[] | null;
  licenses?: string[] | null;
  offices?: string[] | null;
  availability_status: string | null;
  verification_status: string;
  badge_label: string | null;
  rating_avg: number;
  jobs_completed: number;
  services: ProviderServiceItem[] | null;
  /** Public storefront links (Website, LinkedIn, Facebook, Instagram, …). */
  social_links?: Record<string, string> | null;
  /** Registered business address, as published by the company. */
  address?: string | null;
  /** Business registration number (CIN), as published by the company. */
  registration_number?: string | null;
  /** Declared marketplace classification (the sheet's category columns). */
  primary_category_name?: string | null;
  subcategory_names?: string[] | null;
  /** Other business categories the company also works in. */
  additional_categories?: string[] | null;
  country?: string | null;
  head_office?: string | null;
  /** The account's single public business number. */
  phone?: string | null;
}

const SOCIAL_LABELS: Record<string, string> = {
  website: "Website",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "Twitter / X",
  other: "Other",
};

const socialLabel = (key: string) =>
  SOCIAL_LABELS[key] ?? (key.startsWith("other_") ? "Other" : key.charAt(0).toUpperCase() + key.slice(1));
/* Mirrors ReviewResponse (app/schemas/review.py). */
interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}
/* Subset of ServiceResponse (app/schemas/service.py) — fields rendered here. */
interface ProviderServiceItem {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  /** Listed price in integer paise; null = the provider published no figure. */
  price_paise?: number | null;
  price_note?: string | null;
  is_active?: boolean;
}

const VERIFICATION_LABELS: Record<string, string> = {
  verified: "Verified",
  under_review: "Verification Under Review",
  pending: "Verification Pending",
  rejected: "Verification Rejected",
};

const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available",
  busy: "Busy",
  unavailable: "Unavailable",
};

type FetchState = "loading" | "loaded" | "notfound" | "forbidden" | "error";

export const ProviderProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMe = id === "me";

  const [profile, setProfile] = useState<ProviderProfileData | null>(null);
  const [state, setState] = useState<FetchState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [reviews, setReviews] = useState<ReviewItem[] | null>(null);
  const [reviewsState, setReviewsState] = useState<"loading" | "loaded" | "error">("loading");
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setProfile(null);
    setErrorMsg(null);

    /* Two id shapes reach this route: the marketplace links a PROFILE id
     * (/profiles/{id}/public), while quotations and orders only carry the
     * provider's USER id (Quote.provider_id is users.id). A user id is never a
     * profile id, so a 404 means "user id" and the by-user view — same payload,
     * same public fields — is the right second attempt. */
    const fetchProfile = isMe
      ? profilesService.getMyProfile()
      : profilesService.getPublicProfileById(id as string).catch((err: { response?: { status?: number } }) => {
          if (err?.response?.status === 404) return profilesService.getPublicProfileByUser(id as string);
          throw err;
        });

    fetchProfile
      .then((data: ProviderProfileData) => {
        if (cancelled) return;
        setProfile(data);
        setState("loaded");
      })
      .catch((err: { response?: { status?: number } }) => {
        if (cancelled) return;
        if (err?.response?.status === 403) setState("forbidden");
        else if (err?.response?.status === 404) setState("notfound");
        else if (err?.response?.status === 429) {
          setErrorMsg("Search limit reached. Please try again later.");
          setState("error");
        }
        else {
          setErrorMsg("Could not load this provider profile. Please try again.");
          setState("error");
        }
      });

    return () => { cancelled = true; };
  }, [id, isMe, reloadKey]);

  /* Reviews are fetched independently once the profile is available. */
  useEffect(() => {
    if (state !== "loaded" || !profile) return;
    let cancelled = false;
    setReviewsState("loading");
    setReviews(null);
    setReviewsError(null);

    providersService
      .getProviderReviews(profile.user_id)
      .then((data: ReviewItem[]) => {
        if (!cancelled) { setReviews(Array.isArray(data) ? data : []); setReviewsState("loaded"); }
      })
      .catch(() => {
        if (!cancelled) { setReviewsError("Could not load reviews."); setReviewsState("error"); }
      });

    return () => { cancelled = true; };
  }, [state, profile]);

  const retry = () => setReloadKey((k) => k + 1);

  /* ---- state renders ---- */
  if (state === "loading") {
    return (
      <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: C.muted }}>Loading profile…</p>
      </div>
    );
  }
  if (state === "notfound") {
    return (
      <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "2rem", textAlign: "center" }}>
        <h1 style={{ fontFamily: M, margin: 0 }}>Provider not found</h1>
        <p style={{ color: C.muted, margin: 0 }}>This provider profile does not exist.</p>
        <button onClick={() => navigate("/analytics")} style={{ padding: "0.7rem 1.5rem", background: C.primary, color: "var(--color-on-brand)", fontFamily: M, fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer" }}>
          Back to Marketplace Insights
        </button>
      </div>
    );
  }
  if (state === "forbidden") {
    return (
      <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "2rem", textAlign: "center" }}>
        <h1 style={{ fontFamily: M, margin: 0 }}>Profile access restricted</h1>
        <p style={{ color: C.muted, margin: 0, maxWidth: 520 }}>Company profiles are visible to clients. Vendors can only view their own company profile.</p>
        <button onClick={() => navigate("/provider-dashboard")} style={{ padding: "0.7rem 1.5rem", background: C.primary, color: "var(--color-on-brand)", fontFamily: M, fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer" }}>
          Back to dashboard
        </button>
      </div>
    );
  }
  if (state === "error" || !profile) {
    return (
      <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "2rem", textAlign: "center" }}>
        <p style={{ color: C.error, margin: 0 }}>{errorMsg ?? "Something went wrong."}</p>
        <button onClick={retry} style={{ padding: "0.7rem 1.5rem", background: C.primary, color: "var(--color-on-brand)", fontFamily: M, fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  /* ---- data prep (hide-when-empty) ---- */
  const services = profile.services ?? [];
  const ports = profile.ports_served ?? [];
  const skills = profile.skills ?? [];
  const licenses = profile.licenses ?? [];
  const offices = profile.offices ?? [];
  const contacts = profile.contacts ?? [];
  const availability = profile.availability_status ? AVAILABILITY_LABELS[profile.availability_status] ?? profile.availability_status : null;
  const verification = VERIFICATION_LABELS[profile.verification_status] ?? profile.verification_status;
  const socialLinks = Object.entries(profile.social_links ?? {}).filter(([, url]) => Boolean(url));
  const address = profile.address ?? null;
  const declaredCapabilities = profile.subcategory_names ?? [];
  // Other business categories the company also works in (never discovery).
  const otherCategories = (profile.additional_categories ?? []).filter(Boolean);

  /** The Business Profile block only exists when at least one of its values does. */
  const hasBusinessProfile =
    [profile.primary_category_name, profile.head_office, profile.country, profile.registration_number, profile.phone]
      .some((v) => typeof v === 'string' && v.trim().length > 0)
    || declaredCapabilities.length > 0
    || otherCategories.length > 0
    || Boolean(address)
    || socialLinks.length > 0;

  /** One label/value row; nothing renders when the value is empty. */
  const Detail: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div style={{ display: 'flex', gap: 10, fontSize: '0.88rem', marginBottom: '0.45rem' }}>
        <span style={{ color: C.muted, minWidth: 170 }}>{label}</span>
        <span style={{ color: C.text }}>{value}</span>
      </div>
    );
  };

  const Section: React.FC<{ kicker: string; title: string; children: React.ReactNode }> = ({ kicker, title, children }) => (
    <section>
      <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: C.muted, display: "block", marginBottom: 8 }}>{kicker}</span>
      <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: "1.6rem", color: C.text, margin: "0 0 1.25rem" }}>{title}</h2>
      {children}
    </section>
  );

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: "100vh", paddingBottom: 140 }}>
      {/* HERO */}
      <section style={{ background: `linear-gradient(135deg, var(--color-brand), var(--color-brand-grad-end))`, padding: "4rem 3rem 3rem", width: "100%" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <button onClick={() => navigate("/")} aria-label="Nhaav home" style={{ background: "none", border: "none", padding: 0, marginBottom: "1.25rem", cursor: "pointer" }}>
            <BrandLogo height={22} variant="light" />
          </button>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em",
              background: profile.verification_status === "verified" ? "rgba(255, 243, 109,0.18)" : "rgba(255, 243, 109,0.12)",
              color: "var(--color-background)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>{profile.verification_status === "verified" ? "verified" : "hourglass_top"}</span>
              {profile.badge_label ?? verification}
            </span>
            {availability && (
              <span style={{ fontSize: "0.65rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255, 243, 109,0.75)" }}>{availability}</span>
            )}
          </div>
          <h1 style={{ fontFamily: M, fontWeight: 800, fontSize: "clamp(2rem,5vw,3.2rem)", color: "var(--color-background)", letterSpacing: "-0.03em", margin: "0 0 2rem" }}>
            {profile.company_name ?? "Unnamed Provider"}
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3rem" }}>
            {profile.years_experience !== null && profile.years_experience !== undefined && (
              <div><span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255, 243, 109,0.66)", display: "block", marginBottom: 4 }}>Experience</span><span style={{ fontFamily: M, fontWeight: 700, fontSize: "1.6rem", color: "var(--color-background)" }}>{profile.years_experience} yr{profile.years_experience === 1 ? "" : "s"}</span></div>
            )}
            <div><span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255, 243, 109,0.66)", display: "block", marginBottom: 4 }}>Jobs Completed</span><span style={{ fontFamily: M, fontWeight: 700, fontSize: "1.6rem", color: "var(--color-background)" }}>{profile.jobs_completed}</span></div>
            <div><span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255, 243, 109,0.66)", display: "block", marginBottom: 4 }}>Rating</span><span style={{ fontFamily: M, fontWeight: 700, fontSize: "1.6rem", color: "var(--color-background)", display: "flex", alignItems: "center", gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: "1.3rem", color: "var(--color-background)", fontVariationSettings: "'FILL' 1" }}>star</span>{profile.rating_avg.toFixed(1)}
            </span></div>
            {profile.position && (
              <div><span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255, 243, 109,0.66)", display: "block", marginBottom: 4 }}>Role</span><span style={{ fontFamily: M, fontWeight: 700, fontSize: "1.6rem", color: "var(--color-background)" }}>{profile.position}</span></div>
            )}
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "3rem 3rem 0", display: "flex", flexDirection: "column", gap: "3.5rem" }}>
        {profile.bio && (
          <Section kicker="About Company" title="Company Overview">
            <p style={{ color: C.muted, lineHeight: 1.8, maxWidth: 760, margin: 0 }}>{profile.bio}</p>
          </Section>
        )}

        {hasBusinessProfile && (
        <Section kicker="Company Details" title="Business Profile">
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 760 }}>
              <div>
                <Detail label="Primary category" value={profile.primary_category_name ?? undefined} />
                <Detail label="Capabilities" value={declaredCapabilities.length > 0 ? declaredCapabilities.join(', ') : undefined} />
                <Detail label="Also operates in" value={otherCategories.length > 0 ? otherCategories.join(', ') : undefined} />
                <Detail label="Head office / main port" value={profile.head_office ?? undefined} />
                <Detail label="Country" value={profile.country ?? undefined} />
                <Detail label="Company registration no." value={profile.registration_number ?? undefined} />
                <Detail
                  label="Business contact"
                  value={profile.phone ? <a href={`tel:${profile.phone.replace(/\s+/g, '')}`} style={{ color: C.text, fontWeight: 600, textDecoration: 'none' }}>{profile.phone}</a> : undefined}
                />
              </div>
              {address && (
                <p style={{ color: C.text, lineHeight: 1.7, margin: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "1.2rem", color: C.cyan }}>location_on</span>{address}
                </p>
              )}
              {socialLinks.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                  {socialLinks.map(([network, url]) => (
                    <a
                      key={network}
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.bgLow, color: C.text, fontSize: "0.82rem", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: C.cyan }}>public</span>{socialLabel(network)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {skills.length > 0 && (
          <Section kicker="Core Competencies" title="Expertise">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {skills.map((s) => (
                <span key={s} style={{ padding: "8px 18px", background: C.bgLow, color: C.text, borderRadius: 999, fontSize: "0.875rem", fontWeight: 600, border: `1px solid ${C.border}`, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: C.cyan }}>build</span>{s}
                </span>
              ))}
            </div>
          </Section>
        )}

        {services.length > 0 && (
          <Section kicker="Capabilities" title="Services Provided">
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {services.map((s) => (
                <div key={s.id} style={{ background: C.bgLow, padding: "1.1rem 1.5rem", borderRadius: 16, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div>
                    <strong style={{ fontFamily: M, fontSize: "1rem", color: C.text }}>{s.name}</strong>
                    {s.category && <span style={{ fontSize: "0.75rem", color: C.muted, marginLeft: 10 }}>{s.category}{s.subcategory ? ` · ${s.subcategory}` : ""}</span>}
                    {s.description && <p style={{ fontSize: "0.8rem", color: C.muted, margin: "4px 0 0" }}>{s.description}</p>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontFamily: M, fontWeight: 800, fontSize: "0.9rem", color: C.text }}>
                      TBC
                    </span>
                    {(s.is_active ?? true) && <span className="badge badge-green">Active</span>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {ports.length > 0 && (
          <Section kicker="Operational Hubs" title="Ports Served">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {ports.map((p) => (
                <span key={p} style={{ padding: "8px 18px", background: C.bgLow, color: C.text, borderRadius: 999, fontSize: "0.875rem", fontWeight: 600, border: `1px solid ${C.border}`, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: C.cyan }}>anchor</span>{p}
                </span>
              ))}
            </div>
          </Section>
        )}

        {licenses.length > 0 && (
          <Section kicker="Credentials" title="Licenses & Certifications">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              {licenses.map((lic, i) => (
                <div key={`${lic}-${i}`} style={{ background: C.bgLow, padding: "1.25rem 1.75rem", borderRadius: 12, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "1rem", minWidth: 240 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "1.6rem", color: C.primary }}>verified_user</span>
                  <span style={{ fontWeight: 600, color: C.text }}>{lic}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {offices.length > 0 && (
          <Section kicker="Locations" title="Offices">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
              {offices.map((o, i) => (
                <div key={`${o}-${i}`} style={{ background: C.bgLow, padding: "1rem 1.25rem", borderRadius: 12, border: `1px solid ${C.border}`, fontSize: "0.9rem", color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ color: C.primary, fontSize: "1.1rem" }}>location_on</span>{o}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* REVIEWS — fetched independently */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <span style={{ fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.2em", color: C.muted, display: "block", marginBottom: 8 }}>Market Reputation</span>
              <h2 style={{ fontFamily: M, fontWeight: 800, fontSize: "1.6rem", color: C.text, margin: 0 }}>Ratings &amp; Reviews</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontFamily: M, fontWeight: 700, fontSize: "2rem", color: C.primary }}>{profile.rating_avg.toFixed(1)}</span>
            </div>
          </div>

          {reviewsState === "loading" && <p style={{ color: C.muted, fontSize: "0.875rem" }}>Loading reviews…</p>}
          {reviewsState === "error" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: C.error, fontSize: "0.85rem" }}>
              {reviewsError}
              <button onClick={retry} style={{ background: "none", border: "1px solid currentColor", borderRadius: 8, cursor: "pointer", padding: "0.25rem 0.75rem", color: C.error, fontWeight: 700 }}>Retry</button>
            </div>
          )}
          {reviewsState === "loaded" && (reviews ?? []).length === 0 && (
            <p style={{ color: C.muted, fontSize: "0.875rem", background: C.bgLow, padding: "1.5rem", borderRadius: 12, margin: 0 }}>
              No reviews yet for this provider.
            </p>
          )}
          {reviewsState === "loaded" && (reviews ?? []).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {(reviews ?? []).map((r) => (
                <div key={r.id} style={{ background: C.bgLow, padding: "1.5rem", borderRadius: 12, border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", color: C.primary }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className="material-symbols-outlined" style={{ fontSize: "1rem", fontVariationSettings: i < r.rating ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                      ))}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: C.dim }}>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.comment && <p style={{ color: C.muted, lineHeight: 1.7, margin: 0 }}>&ldquo;{r.comment}&rdquo;</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {contacts.length > 0 && (
          <Section kicker="Get in touch" title="Contact">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              {contacts.map((c, i) => {
                const label = typeof c.label === "string" ? c.label : `Contact ${i + 1}`;
                const value = typeof c.value === "string" ? c.value : "";
                return (
                  <div key={i} style={{ background: C.bgLow, padding: "1rem 1.5rem", borderRadius: 12, border: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: "0.6rem", color: C.dim, textTransform: "uppercase", letterSpacing: "0.15em", margin: "0 0 4px" }}>{label}</p>
                    <p style={{ fontFamily: M, fontWeight: 700, fontSize: "0.95rem", color: C.text, margin: 0 }}>{value || "—"}</p>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </div>

      {/* STICKY BOTTOM BAR */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, padding: "1.25rem", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ maxWidth: 800, width: "100%", background: C.bgHigh, padding: "1rem 1.5rem", borderRadius: 999, border: `1px solid ${C.border}`, boxShadow: "0 -4px 16px rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", pointerEvents: "auto" }}>
          <div>
            <p style={{ fontSize: "0.55rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.15em", margin: "0 0 2px" }}>Primary Contact</p>
            <p style={{ fontFamily: M, fontWeight: 700, fontSize: "0.9rem", color: C.text, margin: 0 }}>
              {contacts.length > 0 && typeof (contacts[0] as { label?: unknown; value?: unknown }).value === "string"
                ? (contacts[0] as { value: string }).value
                : profile.company_name ?? "Via platform"}
            </p>
          </div>
          {isMe ? (
            <button onClick={() => navigate("/profile/edit")} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 2rem", background: C.primary, color: "var(--color-on-brand)", fontFamily: M, fontWeight: 700, fontSize: "0.875rem", border: "none", borderRadius: 999, cursor: "pointer" }}>
              Edit Profile <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>edit</span>
            </button>
          ) : (
            <button onClick={() => navigate("/create-request?type=service")} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 2rem", background: C.primary, color: "var(--color-on-brand)", fontFamily: M, fontWeight: 700, fontSize: "0.875rem", border: "none", borderRadius: 999, cursor: "pointer" }}>
              Request Service <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProviderProfile;
