import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jobsService } from '../../../services/jobs';
import { ProviderSidebar } from '../../../components/ProviderSidebar';
import { safeAttachmentHref } from '../../../utils/safeHref';

const C = {
  bg:        'var(--color-background)',
  bgCard:    'var(--color-surface)',
  bgCardH:   'var(--color-surface)',
  bgHigh:    'var(--color-surface-deep)',
  bgLowest:  'var(--color-surface-alt)',
  bgLow:     'var(--color-surface-alt)',
  border:    'var(--color-border)',
  text:      'var(--color-text)',
  muted:     'var(--color-muted)',
  slate:     'var(--color-muted)',
  cyan: 'var(--color-brand)',
  dim:       'var(--color-faint)',
  white:     'var(--color-text)',
  green:     'var(--color-success)',
  error:     'var(--color-error)',
  secondary: 'var(--color-muted)',
  amber:     'var(--color-warning)',
  purple:    '#a855f7',
  gray:      '#9ca3af'
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };
const glass: React.CSSProperties = { background: 'var(--color-surface)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: `1px solid ${C.border}` };

export const JobDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchJob(id);
  }, [id]);

  const fetchJob = async (jobId: string) => {
    try {
      setLoading(true);
      const data = await jobsService.getJobById(jobId);
      setJob(data);
    } catch (err) {
      console.error("Failed to fetch job", err);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!window.confirm('Are you sure you want to mark this job as completed?')) return;
    try {
      await jobsService.completeJob(job.id);
      fetchJob(job.id); // refresh
    } catch (e) {
      console.error(e);
      alert('Failed to complete job');
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('WARNING: Cancelling this job will notify the client. Proceed?')) return;
    try {
      await jobsService.cancelJob(job.id);
      fetchJob(job.id); // refresh
    } catch (e) {
      console.error(e);
      alert('Failed to cancel job');
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'active') return C.cyan;
    if (status === 'completed') return C.green;
    if (status === 'cancelled') return C.error;
    return C.slate;
  };

  if (loading) {
    return (
      <div style={{ background: C.bg, color: C.text, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.cyan, fontSize: '1.2rem', fontFamily: fonts.inter }}>Loading Active Job Details...</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ background: C.bg, color: C.text, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <span className="material-symbols-outlined" style={{ fontSize: '4rem', color: C.error }}>error</span>
        <div style={{ color: C.muted, fontSize: '1.2rem', fontFamily: fonts.inter }}>Job Not Found</div>
        <button onClick={() => navigate('/jobs')} style={{ padding: '0.75rem 1.5rem', background: C.bgCardH, color: C.white, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}>Back to Jobs</button>
      </div>
    );
  }

  // Progress derived from real job state only. There is no crew-tracking
  // backend yet, so an in-progress job has no honest percentage to show —
  // the bar is deliberately omitted rather than fabricating one.
  const showProgress = job.status === 'cancelled';
  const progressPercent = 0;

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', paddingBottom: '5rem' }}>
      <ProviderSidebar activePath="/jobs" />
      <header style={{
        height: 64, marginLeft: 'var(--sidebar-width, 256px)', background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', paddingLeft: 'var(--header-padding-left, 4.5rem)', paddingRight: '2.5rem', borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 50, transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        <button onClick={() => navigate('/jobs')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Back to Jobs
        </button>
      </header>

      <main style={{ maxWidth: 1200, marginLeft: 'var(--sidebar-width, 256px)', padding: '3rem 2.5rem', transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        
        {/* Header & Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: C.white, display: 'flex', alignItems: 'center', gap: 12 }}>
              {job.request?.title || job.request?.service_type || 'Unknown Service Job'}
              <span style={{ 
                padding: '6px 16px', borderRadius: 999, background: `rgba(${getStatusColor(job.status) === C.cyan ? '76,214,255' : (getStatusColor(job.status) === C.green ? '34,197,94' : '255,180,171')}, 0.1)`,
                color: getStatusColor(job.status), fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', border: `1px solid ${getStatusColor(job.status)}`
              }}>
                {job.status}
              </span>
            </h1>
            <p style={{ color: C.slate, margin: 0, fontSize: '1rem' }}>
              Job ID: <span style={{ color: C.white, fontFamily: 'monospace' }}>{job.id}</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {job.status === 'active' && (
              <>
                <button onClick={handleCancel} style={{ padding: '0.75rem 1.5rem', background: 'transparent', color: C.error, border: `1px solid ${C.error}`, borderRadius: 8, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 180, 171, 0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  Cancel Job
                </button>
                <button onClick={handleComplete} style={{ padding: '0.75rem 1.5rem', background: C.cyan, color: 'var(--color-on-brand)', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 0 20px rgba(76, 214, 255, 0.2)', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>check_circle</span>
                  Mark Completed
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar or Completion Summary */}
        {job.status === 'completed' ? (
          <div style={{ ...glass, borderRadius: 16, padding: '2rem', marginBottom: '2rem', border: `1px solid ${C.green}40`, background: `linear-gradient(145deg, rgba(34, 197, 94, 0.05) 0%, ${C.bgCard} 100%)` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.green, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined">task_alt</span> Job Successfully Completed
                </h3>
                <span style={{ color: C.slate, fontSize: '0.875rem' }}>
                  Completed on: {job.completed_at ? new Date(job.completed_at).toLocaleDateString() : 'Unknown'}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', color: C.slate, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Final Invoice Amount</span>
                <span style={{ fontFamily: fonts.manrope, fontSize: '1.5rem', fontWeight: 800, color: C.white }}>
                  {job.quote?.currency || 'USD'} {job.quote?.amount?.toLocaleString() || 'N/A'}
                </span>
              </div>
            </div>
          </div>
        ) : showProgress ? (
          <div style={{ ...glass, borderRadius: 16, padding: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.amber }}>moving</span> Job Progress
              </h3>
              <span style={{ color: C.cyan, fontWeight: 800, fontSize: '1.25rem' }}>{progressPercent}%</span>
            </div>
            <div style={{ width: '100%', height: 12, background: C.bgHigh || '#1e293b', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${progressPercent}%`, height: '100%', background: `linear-gradient(90deg, ${C.cyan}, ${C.purple})`, borderRadius: 999, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', fontSize: '0.875rem', color: C.slate }}>
              <span>Initiated: {new Date(job.started_at || job.created_at).toLocaleDateString()}</span>
              <span>Target Completion: {job.quote?.estimated_completion_date ? new Date(job.quote.estimated_completion_date).toLocaleDateString() : 'TBD'}</span>
            </div>
          </div>
        ) : (
          <div style={{ ...glass, borderRadius: 16, padding: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.amber }}>moving</span> Job Status
              </h3>
              <span style={{ padding: '4px 12px', borderRadius: 999, border: `1px solid ${C.cyan}`, color: C.cyan, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                In Progress
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: C.slate }}>
              <span>Initiated: {new Date(job.started_at || job.created_at).toLocaleDateString()}</span>
              <span>Target Completion: {job.quote?.estimated_completion_date ? new Date(job.quote.estimated_completion_date).toLocaleDateString() : 'TBD'}</span>
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: C.dim }}>
              Detailed progress tracking is not yet available for this job.
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
          
          {/* Client & Logistics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ ...glass, borderRadius: 16, padding: '2rem' }}>
              <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.secondary }}>corporate_fare</span> Client Details
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.slate, fontSize: '0.875rem' }}>Company</span>
                  <span style={{ color: C.white, fontWeight: 600 }}>{job.request?.client?.company_name || 'Unknown Client'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.slate, fontSize: '0.875rem' }}>Representative</span>
                  <span style={{ color: C.white, fontWeight: 600 }}>{job.request?.client?.first_name || ''} {job.request?.client?.last_name || ''}</span>
                </div>
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 16, padding: '2rem' }}>
              <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.cyan }}>directions_boat</span> Vessel & Location
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.slate, fontSize: '0.875rem' }}>Vessel</span>
                  <span style={{ color: C.white, fontWeight: 600 }}>{job.request?.vessel_name || 'Not Specified'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.slate, fontSize: '0.875rem' }}>Port Location</span>
                  <span style={{ color: C.white, fontWeight: 600 }}>{job.request?.port || 'Not Specified'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Engineers/Timeline OR Review/Invoice */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {job.status === 'completed' && job.review ? (
              <div style={{ ...glass, borderRadius: 16, padding: '2rem' }}>
                <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ color: C.amber }}>star</span> Client Review
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <span key={star} className="material-symbols-outlined" style={{ color: star <= job.review.rating ? C.amber : C.slate, fontSize: '1.5rem', fontVariationSettings: star <= job.review.rating ? "'FILL' 1" : "'FILL' 0" }}>
                      star
                    </span>
                  ))}
                  <span style={{ color: C.white, fontWeight: 700, marginLeft: '0.5rem', fontSize: '1.25rem' }}>{job.review.rating}.0</span>
                </div>
                {job.review.comment && (
                  <div style={{ padding: '1rem', background: C.bgCardH, borderRadius: 12, border: `1px solid ${C.border}`, color: C.text, fontStyle: 'italic', fontSize: '0.95rem', lineHeight: 1.5 }}>
                    "{job.review.comment}"
                  </div>
                )}
                <div style={{ marginTop: '1rem', color: C.slate, fontSize: '0.8rem' }}>
                  Reviewed on: {new Date(job.review.created_at).toLocaleDateString()}
                </div>
              </div>
            ) : job.status === 'completed' && !job.review ? (
              <div style={{ ...glass, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', minHeight: '200px' }}>
                <span className="material-symbols-outlined" style={{ color: C.slate, fontSize: '3rem' }}>rate_review</span>
                <span style={{ color: C.dim, fontSize: '0.95rem' }}>Waiting for client review...</span>
              </div>
            ) : (
              <div style={{ ...glass, borderRadius: 16, padding: '2rem' }}>
                <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ color: C.purple }}>engineering</span> Assigned Crew
                  </div>
                </h3>

                {/* No crew-assignment backend exists yet — represent that
                    honestly instead of rendering fabricated personnel. */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '1.5rem 1rem', background: C.bgCardH, borderRadius: 12, border: `1px dashed ${C.border}` }}>
                  <span className="material-symbols-outlined" style={{ color: C.slate, fontSize: '2rem' }}>engineering</span>
                  <span style={{ color: C.slate, fontSize: '0.9rem', textAlign: 'center' }}>
                    Crew assignment is not yet available for this job.
                  </span>
                  <span style={{ color: C.dim, fontSize: '0.8rem', textAlign: 'center' }}>
                    Contact {job.request?.client?.company_name || 'the client'} for on-site personnel details.
                  </span>
                </div>
              </div>
            )}

            {/* Documents */}
            <div style={{ ...glass, borderRadius: 16, padding: '2rem' }}>
              <h3 style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.dim }}>folder</span> Execution Documents
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {job.quote?.attachments && job.quote.attachments.length > 0 ? (
                  job.quote.attachments.map((doc: string, idx: number) => {
                    // Security: only http(s)/path/file-name values become links;
                    // dangerous schemes (javascript:) render as inert text.
                    const safeHref = safeAttachmentHref(doc);
                    return safeHref ? (
                      <a key={idx} href={safeHref} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: C.bgCardH, borderRadius: 12, border: `1px solid ${C.border}`, textDecoration: 'none', color: C.text, transition: 'border 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = C.cyan} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span className="material-symbols-outlined" style={{ color: C.cyan }}>description</span>
                          <span style={{ fontSize: '0.875rem' }}>Quotation_Document_{idx+1}.pdf</span>
                        </div>
                        <span className="material-symbols-outlined" style={{ color: C.slate, fontSize: '1.2rem' }}>download</span>
                      </a>
                    ) : (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: C.bgCardH, borderRadius: 12, border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span className="material-symbols-outlined" style={{ color: C.slate }}>description</span>
                          <span style={{ fontSize: '0.875rem' }}>Quotation_Document_{idx+1}.pdf</span>
                        </div>
                        <span style={{ color: C.slate, fontSize: '0.75rem' }}>Link disabled</span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: C.slate, fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>No initial documents uploaded.</div>
                )}
                {job.status === 'active' && (
                  <button style={{ width: '100%', padding: '1rem', background: 'transparent', border: `1px dashed ${C.slate}`, borderRadius: 12, color: C.cyan, fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.cyan; e.currentTarget.style.background = 'rgba(76,157,176,0.05)' }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.slate; e.currentTarget.style.background = 'transparent' }}>
                    + Upload Execution Report
                  </button>
                )}
                {job.status === 'completed' && (
                  <button style={{ width: '100%', padding: '1rem', background: C.cyan, border: 'none', borderRadius: 12, color: 'var(--color-on-brand)', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                    <span className="material-symbols-outlined">download</span> Download Final Report
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};
