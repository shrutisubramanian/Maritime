import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quotesService } from '../../../services/quotes';

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
  amber:     '#fbbf24',
  purple:    '#a855f7',
  gray:      '#9ca3af'
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export const MyQuotations: React.FC = () => {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyQuotes();
  }, []);

  const fetchMyQuotes = async () => {
    try {
      setLoading(true);
      const data = await quotesService.getMyQuotations();
      // Sort by newest first
      data.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setQuotes(data);
    } catch (err) {
      console.error("Failed to fetch quotes", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'draft') return C.slate;
    if (s === 'submitted') return C.cyan;
    if (s === 'under_review') return C.amber;
    if (s === 'accepted') return C.green;
    if (s === 'rejected') return C.error;
    if (s === 'expired') return C.gray;
    return C.dim;
  };

  const getStatusMessage = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s === 'draft') return 'Not submitted yet. Review and submit.';
    if (s === 'submitted') return 'Pending Client Review.';
    if (s === 'under_review') return 'Client is currently reviewing your quote.';
    if (s === 'accepted') return 'Client has accepted! Check Active Jobs.';
    if (s === 'rejected') return 'Client selected another provider.';
    if (s === 'expired') return 'This quotation has expired.';
    return 'Status Unknown.';
  };

  const formatStatus = (status: string) => {
    if (!status) return 'Unknown';
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh' }}>
      <header style={{
        height: 64, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`
      }}>
        <button onClick={() => navigate('/provider-dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Back to Dashboard
        </button>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 2.5rem' }}>
        <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: C.white }}>
          My Quotations
        </h1>
        <p style={{ color: C.slate, margin: '0 0 3rem', fontSize: '1rem' }}>Track the status of your submitted procurement quotations.</p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: C.muted }}>Loading your quotations...</div>
        ) : quotes.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: C.bgLow, borderRadius: 24, border: `1px dashed ${C.border}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.slate, marginBottom: '1rem' }}>request_quote</span>
            <p style={{ color: C.muted, margin: 0 }}>You haven't submitted any quotations yet.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
            {quotes.map((quote, i) => (
              <div key={i} onClick={() => navigate('/my-quotations/' + quote.id)} style={{ background: C.bgLow, borderRadius: 16, padding: '1.5rem', border: `1px solid ${C.border}`, position: 'relative', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1.2rem', color: C.white, margin: 0 }}>
                    {quote.request?.title || quote.request?.service_type || 'Unknown Service Request'}
                  </h3>
                  <span style={{ 
                    padding: '4px 12px', 
                    borderRadius: 6, 
                    background: 'rgba(255,255,255,0.05)', 
                    color: getStatusColor(quote.status), 
                    fontSize: '0.7rem', 
                    fontWeight: 700, 
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap'
                  }}>
                    {formatStatus(quote.status)}
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: C.muted }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: C.slate }}>monetization_on</span>
                    Total Estimate: <span style={{ color: C.text, fontWeight: 600 }}>{quote.currency || '$'} {quote.amount?.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: C.muted }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: C.slate }}>schedule</span>
                    Start Date: <span style={{ color: C.text, fontWeight: 600 }}>{quote.estimated_start_date ? new Date(quote.estimated_start_date).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: C.muted }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: C.slate }}>timer</span>
                    Submitted: <span style={{ color: C.text, fontWeight: 600 }}>{new Date(quote.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1rem' }}>
                  <p style={{ fontSize: '0.875rem', color: C.slate, margin: 0 }}>
                    {getStatusMessage(quote.status)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
