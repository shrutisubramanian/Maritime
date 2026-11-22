import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsService } from '../../../services/jobs';
import { providersService } from '../../../services/providers';
import { BrandLogo } from '../../../components/BrandLogo';

/**
 * Marketplace Insights (/analytics).
 *
 * H9 wire-minimal rework (per H9_ANALYTICS_AUDIT.md): every fabricated metric
 * was removed. All displayed data comes from existing endpoints — the
 * authenticated user's jobs via `GET /jobs/` and the marketplace provider
 * leaderboard via `GET /profiles/providers` (used as-is, no invented
 * verified-only filtering). No time-series, revenue, response-time, or
 * port-activity data exists in the backend, so no such claim is made here.
 */

const T = {
  manrope:  "'Manrope', sans-serif"  as const,
  inter:    "'Inter', sans-serif"    as const,
  bg:       'var(--color-background)',
  bgLow:    'var(--color-surface-alt)',
  bgHighest:'var(--color-surface-alt)',
  border:   'var(--color-border)',
  text:     'var(--color-text)',
  muted:    'var(--color-muted)',
  dim:      'var(--color-faint)',
  cyan: 'var(--color-brand)',
  primary: 'var(--color-brand)',
  secondary: 'var(--color-muted)',
  error:    'var(--color-error)',
};

/* Mirrors JobResponse — only fields the API actually returns. */
interface JobItem {
  id: string;
  status: string;
}
/* Mirrors ProfileResponse from app/schemas/profile.py. */
interface ProviderItem {
  id: string;
  user_id: string;
  company_name: string | null;
  rating_avg: number;
  jobs_completed: number;
}

const KPI_CARDS = [
  { key: 'active',    label: 'My Active Jobs',    color: T.cyan },
  { key: 'completed', label: 'My Completed Jobs', color: T.primary },
] as const;

export const AnalyticsDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<JobItem[] | null>(null);
  const [providers, setProviders] = useState<ProviderItem[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setJobs(null);
    setProviders(null);
    setJobsError(null);
    setProvidersError(null);

    jobsService
      .getUserJobs()
      .then((data: JobItem[]) => { if (!cancelled) setJobs(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setJobsError('Could not load your jobs. Please try again.'); });

    providersService
      .getProviders({ limit: 20 })
      .then((data: { data?: ProviderItem[] }) => {
        if (!cancelled) setProviders(Array.isArray(data?.data) ? data.data : []);
      })
      .catch(() => { if (!cancelled) setProvidersError('Could not load providers. Please try again.'); });

    return () => { cancelled = true; };
  }, [reloadKey]);

  const activeJobs = jobs?.filter((j) => j.status === 'active').length ?? 0;
  const completedJobs = jobs?.filter((j) => j.status === 'completed').length ?? 0;
  const kpiValues: Record<(typeof KPI_CARDS)[number]['key'], string> = {
    active: jobs ? String(activeJobs) : '—',
    completed: jobs ? String(completedJobs) : '—',
  };

  const topProviders = (providers ?? [])
    .slice()
    .sort((a, b) => b.jobs_completed - a.jobs_completed)
    .slice(0, 5);

  const retry = () => setReloadKey((k) => k + 1);

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: T.inter, minHeight: '100vh' }}>
      <main style={{ minHeight: '100vh', background: T.bg }}>
        <div style={{ padding: '2.5rem 1.5rem 3rem', maxWidth: 1400, margin: '0 auto' }}>

          <button onClick={() => navigate('/')} aria-label="Nhaav home" style={{ background: 'none', border: 'none', padding: 0, marginBottom: '1.5rem', cursor: 'pointer' }}>
            <BrandLogo height={22} />
          </button>

          {/* heading */}
          <div style={{ marginBottom: '2.5rem' }}>
            <p style={{ fontSize: '0.6rem', color: T.cyan, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>Marketplace Insights</p>
            <h1 style={{ fontFamily: T.manrope, fontWeight: 800, fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', color: T.text, letterSpacing: '-0.04em', margin: 0 }}>Your Activity &amp; Provider Leaderboard</h1>
          </div>

          {/* KPI cards — counts derived from the authenticated user's jobs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {KPI_CARDS.map(c => (
              <div key={c.key} style={{ background: T.bgLow, borderRadius: 16, padding: '1.5rem', borderLeft: `4px solid ${c.color}` }}>
                <p style={{ fontSize: '0.65rem', color: T.muted, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</p>
                <p style={{ fontFamily: T.manrope, fontWeight: 800, fontSize: '2rem', color: T.text, letterSpacing: '-0.04em', margin: 0 }}>{kpiValues[c.key]}</p>
              </div>
            ))}
          </div>

          {/* jobs error / empty states */}
          {jobsError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: 12, border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.08)', color: T.error, fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              {jobsError}
              <button onClick={retry} style={{ background: 'none', border: '1px solid currentColor', borderRadius: 8, cursor: 'pointer', padding: '0.25rem 0.75rem', color: T.error, fontWeight: 700 }}>Retry</button>
            </div>
          )}
          {!jobsError && jobs !== null && jobs.length === 0 && (
            <div style={{ background: T.bgLow, borderRadius: 16, padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
              <p style={{ color: T.muted, fontSize: '0.9rem', margin: 0 }}>
                No jobs yet — jobs appear here once a quotation is accepted.
              </p>
            </div>
          )}

          {/* provider leaderboard */}
          <div style={{ background: T.bgLow, borderRadius: 24, padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ fontFamily: T.manrope, fontWeight: 700, fontSize: '1.1rem', color: T.text, margin: 0 }}>Top Providers</h3>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ranked by completed jobs</span>
            </div>

            {providersError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: 12, border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.08)', color: T.error, fontSize: '0.85rem' }}>
                {providersError}
                <button onClick={retry} style={{ background: 'none', border: '1px solid currentColor', borderRadius: 8, cursor: 'pointer', padding: '0.25rem 0.75rem', color: T.error, fontWeight: 700 }}>Retry</button>
              </div>
            )}
            {!providersError && providers === null && (
              <div style={{ padding: '2rem', textAlign: 'center', color: T.muted, fontSize: '0.875rem' }}>
                Loading providers…
              </div>
            )}
            {!providersError && providers !== null && topProviders.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p style={{ color: T.muted, fontSize: '0.9rem', margin: 0 }}>No providers listed yet.</p>
              </div>
            )}
            {!providersError && providers !== null && topProviders.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {topProviders.map((p, i) => (
                  <div key={p.id}
                    onClick={() => navigate(`/provider/${p.id}`)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: T.bgLow, borderRadius: 16, border: `1px solid ${T.border}`, cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(76,157,176,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.bgHighest, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.manrope, fontWeight: 900, fontSize: '0.8rem', color: i === 0 ? T.cyan : T.secondary, flexShrink: 0 }}>{i + 1}</div>
                      <div>
                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: T.text, margin: 0 }}>{p.company_name ?? 'Unnamed provider'}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', textAlign: 'right' }}>
                      <div>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px' }}>Rating</p>
                        <p style={{ fontFamily: T.manrope, fontWeight: 900, fontSize: '0.95rem', color: T.cyan, margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.8rem', fontVariationSettings: "'FILL' 1" }}>star</span>{p.rating_avg.toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.55rem', fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px' }}>Jobs Completed</p>
                        <p style={{ fontFamily: T.manrope, fontWeight: 900, fontSize: '0.95rem', color: T.primary, margin: 0 }}>{p.jobs_completed}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default AnalyticsDashboard;
