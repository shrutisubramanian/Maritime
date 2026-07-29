import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { requestsService } from '../../../services/requests';
import { quotesService } from '../../../services/quotes';
import { ConfirmationModal } from '../../../components/ConfirmationModal';

/* ── Design tokens ── */
const C = {
  bg:        '#0d141d',
  bgCardH:   '#242a34',
  bgLow:     '#151c26',
  bgLowest:  '#080f18',
  border:    'rgba(255,255,255,0.05)',
  text:      '#dce3f0',
  muted:     '#c4c6ce',
  slate:     '#64748b',
  cyan:      '#4cd6ff',
  dim:       '#8e9098',
  white:     '#ffffff',
  primary:   '#9ccaff',
  secondary: '#a6c9fa',
  error:     '#ffb4ab',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export const RequestDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [requestData, setRequestData] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{ type: 'accept' | 'reject' | 'close' | null, quoteId?: string }>({ type: null });

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const reqRes = await requestsService.getRequestById(id);
        setRequestData(reqRes);

        const quotesRes = await quotesService.getQuotesForRequest(id);
        setQuotes(quotesRes); // Assuming it returns a list of quotes
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleAcceptQuote = async () => {
    if (!modalState.quoteId) return;
    try {
      setProcessingId(modalState.quoteId);
      await quotesService.acceptQuote(modalState.quoteId);
      setModalState({ type: null });
      navigate('/success', { state: { type: 'default', title: 'Quote Accepted', subtitle: 'The provider has been notified and the job is now active in your Active Jobs dashboard.', actionText: 'View Active Jobs', actionPath: '/ship-owner' } });
    } catch (e) {
      console.error(e);
      alert('Failed to accept quote.');
      setProcessingId(null);
      setModalState({ type: null });
    }
  };

  const handleRejectQuote = async () => {
    if (!modalState.quoteId) return;
    try {
      setProcessingId(modalState.quoteId);
      await quotesService.rejectQuote(modalState.quoteId);
      setQuotes(quotes.map(q => q.id === modalState.quoteId ? { ...q, status: 'rejected' } : q));
      setModalState({ type: null });
    } catch (e) {
      console.error(e);
      alert('Failed to reject quote.');
      setModalState({ type: null });
    } finally {
      setProcessingId(null);
    }
  };

  const handleCloseRequest = async () => {
    // Mock closing the request
    setModalState({ type: null });
    navigate('/success', { state: { type: 'default', title: 'Request Closed', subtitle: 'This procurement request has been permanently closed. Providers can no longer submit quotations.', actionText: 'Back to Dashboard', actionPath: '/ship-owner' } });
  };

  if (loading) {
    return <div style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '2rem' }}>Loading...</div>;
  }

  if (!requestData) {
    return <div style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '2rem' }}>Request not found.</div>;
  }

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh' }}>
      
      {/* ── TOP NAV (Simplified) ── */}
      <header style={{
        height: 64, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`
      }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
            Back
          </button>
        </div>
        {requestData?.status === 'open' && (
          <button 
            onClick={() => setModalState({ type: 'close' })}
            style={{ padding: '0.5rem 1.25rem', borderRadius: 8, background: 'rgba(255,180,171,0.1)', color: C.error, fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,180,171,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,180,171,0.1)'}
          >
            Close Request
          </button>
        )}
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 2.5rem' }}>
        
        {/* Request Info Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <span style={{ padding: '4px 12px', background: 'rgba(76,214,255,0.1)', color: C.cyan, borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {requestData.status}
            </span>
            <span style={{ color: C.slate, fontSize: '0.875rem' }}>ID: {requestData.id.substring(0, 8)}</span>
          </div>
          <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 1rem', color: C.white }}>
            {requestData.service_type || 'Service Request'}
          </h1>
          <p style={{ color: C.muted, fontSize: '1rem', lineHeight: 1.6, maxWidth: 800 }}>
            {requestData.description || 'No description provided.'}
          </p>
          <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.slate }}>
              <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.1rem' }}>location_on</span>
              <span style={{ color: C.text }}>{requestData.port}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.slate }}>
              <span className="material-symbols-outlined" style={{ color: '#ef4444', fontSize: '1.1rem' }}>priority_high</span>
              <span style={{ color: C.text }}>Urgency: {requestData.urgency}</span>
            </div>
          </div>
        </div>

        {/* Quotes Section - Compare View */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1.2rem', color: C.white, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Compare Quotations ({quotes.length})
            </h3>
          </div>
          
          {quotes.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: C.bgLow, borderRadius: 24, border: `1px dashed ${C.border}` }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.slate, marginBottom: '1rem' }}>inbox</span>
              <p style={{ color: C.muted, margin: 0 }}>No quotes received yet. Providers are still reviewing your request.</p>
            </div>
          ) : (
            <div style={{ background: C.bgLow, borderRadius: 24, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: C.bgLowest, fontSize: '0.65rem', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Provider</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Price</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>ETA</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Rating</th>
                      <th style={{ padding: '1.25rem 1.5rem' }}>Verified</th>
                      <th style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id} style={{ borderTop: `1px solid ${C.border}`, transition: 'background 0.2s', opacity: q.status === 'rejected' ? 0.5 : 1 }}
                        onMouseEnter={e => { if (q.status !== 'rejected') e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }} 
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}` }}>
                              <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.1rem' }}>factory</span>
                            </div>
                            <span style={{ fontWeight: 700, color: C.white }}>{q.provider?.company_name || 'Unknown Provider'}</span>
                          </div>
                        </td>
                        
                        <td style={{ padding: '1rem 1.5rem', fontFamily: fonts.manrope, fontWeight: 800, color: C.white, fontSize: '1rem' }}>
                          {q.currency} {parseFloat(q.amount).toLocaleString()}
                        </td>
                        
                        <td style={{ padding: '1rem 1.5rem', color: C.cyan, fontWeight: 600 }}>
                          {q.estimated_time_days ? `${q.estimated_time_days} Days` : 'TBD'}
                        </td>
                        
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.cyan }}>
                            <span className="material-symbols-outlined fill" style={{ fontSize: '1rem' }}>star</span>
                            <span style={{ fontWeight: 700, color: C.white }}>{q.provider?.rating_avg ? q.provider.rating_avg.toFixed(1) : 'New'}</span>
                          </div>
                        </td>

                        <td style={{ padding: '1rem 1.5rem' }}>
                          {q.provider?.verification_status === 'verified' ? (
                            <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.25rem', fontVariationSettings: "'FILL' 1" }}>verified</span>
                          ) : (
                            <span style={{ color: C.dim }}>-</span>
                          )}
                        </td>

                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button 
                              onClick={() => navigate(`/provider/${q.provider_id}`)}
                              style={{ padding: '0.5rem 1rem', borderRadius: 8, background: 'transparent', color: C.white, fontSize: '0.75rem', fontWeight: 600, border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background 0.2s' }}
                              onMouseEnter={e => (e.currentTarget.style.background = C.bgCardH)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              View Provider
                            </button>
                            
                            {q.status === 'rejected' ? (
                              <span style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#ef4444' }}>Rejected</span>
                            ) : q.status === 'accepted' ? (
                              <span style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>Accepted</span>
                            ) : (
                              <>
                                <button 
                                  onClick={() => setModalState({ type: 'reject', quoteId: q.id })}
                                  disabled={processingId === q.id || requestData.status !== 'open'}
                                  style={{ padding: '0.5rem 1rem', borderRadius: 8, background: 'rgba(255,180,171,0.1)', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, border: `1px solid rgba(255,180,171,0.2)`, cursor: (processingId === q.id || requestData.status !== 'open') ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
                                  onMouseEnter={e => { if (requestData.status === 'open' && processingId !== q.id) e.currentTarget.style.background = 'rgba(255,180,171,0.2)'; }} 
                                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,180,171,0.1)')}>
                                  Reject
                                </button>
                                
                                <button 
                                  onClick={() => setModalState({ type: 'accept', quoteId: q.id })}
                                  disabled={processingId === q.id || requestData.status !== 'open'}
                                  style={{ padding: '0.5rem 1rem', borderRadius: 8, background: C.cyan, color: '#001f28', fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: (processingId === q.id || requestData.status !== 'open') ? 'not-allowed' : 'pointer', opacity: (processingId === q.id || requestData.status !== 'open') ? 0.6 : 1, transition: 'filter 0.2s' }}
                                  onMouseEnter={e => { if (requestData.status === 'open' && processingId !== q.id) e.currentTarget.style.filter = 'brightness(1.1)'; }} 
                                  onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>
                                  {processingId === q.id ? 'Processing...' : 'Accept'}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </main>

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={modalState.type === 'accept'}
        title="Accept Quotation"
        message="Are you sure you want to accept this quotation? This will notify the provider and convert this request into an Active Job. Other pending quotes will be rejected."
        confirmText="Accept Quote"
        onConfirm={handleAcceptQuote}
        onCancel={() => setModalState({ type: null })}
      />

      <ConfirmationModal
        isOpen={modalState.type === 'reject'}
        title="Reject Quotation"
        message="Are you sure you want to reject this quotation? The provider will be notified. This action cannot be undone."
        confirmText="Reject Quote"
        isDestructive={true}
        onConfirm={handleRejectQuote}
        onCancel={() => setModalState({ type: null })}
      />

      <ConfirmationModal
        isOpen={modalState.type === 'close'}
        title="Close Procurement Request"
        message="Are you sure you want to permanently close this request? No further quotations can be submitted by providers once closed."
        confirmText="Close Request"
        isDestructive={true}
        onConfirm={handleCloseRequest}
        onCancel={() => setModalState({ type: null })}
      />

    </div>
  );
};

export default RequestDetails;
