import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsService } from '../../../services/jobs';

/* ── Design tokens ── */
const C = {
  bg:        '#0d141d',
  bgLow:     '#151c26',
  bgLowest:  '#080f18',
  border:    'rgba(255,255,255,0.05)',
  text:      '#dce3f0',
  muted:     '#c4c6ce',
  slate:     '#64748b',
  cyan:      '#4cd6ff',
  dim:       '#8e9098',
  white:     '#ffffff',
  green:     '#22c55e',
  error:     '#ffb4ab',
  secondary: '#a6c9fa',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export const JobTracking: React.FC = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const res = await jobsService.getUserJobs();
      setJobs(res);
    } catch (err) {
      console.error(err);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to mark this job as completed?')) return;
    try {
      await jobsService.completeJob(jobId); 
      fetchJobs();
    } catch (e) {
      console.error(e);
      alert('Failed to complete job');
    }
  };

  const filteredJobs = jobs.filter(j => j.status === filter);

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh' }}>
      
      {/* ── TOP NAV (Simplified) ── */}
      <header style={{
        height: 64, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Back to Dashboard
        </button>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 2.5rem' }}>
        <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: C.white }}>
          My Jobs
        </h1>
        <p style={{ color: C.slate, margin: '0 0 2rem', fontSize: '1rem' }}>Manage and track all your active and past service jobs.</p>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button onClick={() => setFilter('active')} style={{ padding: '0.75rem 1.5rem', borderRadius: 12, border: 'none', background: filter === 'active' ? C.cyan : C.bgLow, color: filter === 'active' ? '#001f28' : C.white, fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
            Active Jobs
          </button>
          <button onClick={() => setFilter('completed')} style={{ padding: '0.75rem 1.5rem', borderRadius: 12, border: 'none', background: filter === 'completed' ? C.cyan : C.bgLow, color: filter === 'completed' ? '#001f28' : C.white, fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
            Completed Jobs
          </button>
        </div>

        {loading ? (
          <div style={{ color: C.dim }}>Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: C.bgLow, borderRadius: 24, border: `1px dashed ${C.border}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.slate, marginBottom: '1rem' }}>inventory_2</span>
            <p style={{ color: C.muted, margin: 0 }}>No {filter} jobs found.</p>
          </div>
        ) : (
          <div style={{ background: C.bgLow, borderRadius: 24, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.bgLowest, fontSize: '0.6rem', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                  {['Job ID', 'Service Type', 'Provider', 'Status', 'Started', 'Actions'].map((h, i) => (
                    <th key={h} style={{ padding: '1rem 1.5rem', textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job, i) => (
                  <tr key={i} onClick={() => navigate(`/jobs/${job.id}`)} style={{ borderTop: `1px solid ${C.border}`, transition: 'background 0.2s', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '1rem 1.5rem', color: C.dim, fontFamily: 'monospace', fontSize: '0.75rem' }}>{job.id?.substring(0, 8)}</td>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: 500, color: C.white }}>{job.request?.service_type || 'Unknown Service'}</td>
                    <td style={{ padding: '1rem 1.5rem', color: C.text }}>{job.provider?.company_name || 'Unknown Provider'}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(36,72,114,0.3)', color: job.status === 'completed' ? C.green : (job.status === 'cancelled' ? C.error : C.cyan), fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' }}>
                        {job.status}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', color: C.slate }}>{new Date(job.started_at || job.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                      {job.status === 'active' && (
                        <button onClick={(e) => handleComplete(e, job.id)} style={{ padding: '0.5rem 1rem', borderRadius: 6, background: C.cyan, color: '#001f28', fontSize: '0.7rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')} onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>
                          Complete Job
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default JobTracking;
