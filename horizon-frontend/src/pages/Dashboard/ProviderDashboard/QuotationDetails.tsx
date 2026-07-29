import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { quotesService } from '../../../services/quotes';

const C = {
  bg:        '#0d141d',
  bgCard:    '#19202a',
  bgCardH:   '#242a34',
  bgHigh:    '#2e353f',
  bgLowest:  '#080f18',
  bgLow:     '#151c26',
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
const glass: React.CSSProperties = { background: 'rgba(25, 32, 42, 0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: `1px solid ${C.border}` };
const glow: React.CSSProperties = { boxShadow: '0 20px 40px rgba(0,209,255,0.08)' };

export const QuotationDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchQuote(id);
  }, [id]);

  const fetchQuote = async (quoteId: string) => {
    try {
      setLoading(true);
      const data = await quotesService.getQuoteById(quoteId);
      setQuote(data);
    } catch (err) {
      console.error("Failed to fetch quote", err);
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
    if (s === 'expired') return C.dim;
    return C.dim;
  };

  const formatStatus = (status: string) => {
    if (!status) return 'Unknown';
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  if (loading) {
    return (
      <div style={{ background: C.bg, color: C.text, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.cyan, fontSize: '1.2rem', fontFamily: fonts.inter }}>Loading Quotation Details...</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div style={{ background: C.bg, color: C.text, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <span className="material-symbols-outlined" style={{ fontSize: '4rem', color: C.error }}>error</span>
        <div style={{ color: C.muted, fontSize: '1.2rem', fontFamily: fonts.inter }}>Quotation Not Found</div>
        <button onClick={() => navigate('/my-quotations')} style={{ padding: '0.75rem 1.5rem', background: C.bgCardH, color: C.white, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}>Back to My Quotations</button>
      </div>
    );
  }

  const baseAmount = quote.amount || 0;
  const travel = quote.travel_charges || 0;
  const emergency = quote.emergency_charges || 0;
  const taxes = quote.taxes_included ? 0 : (baseAmount * 0.1); // Mock 10% tax if not included
  const totalAmount = baseAmount + travel + emergency + taxes;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', paddingBottom: '5rem' }}>
      <style>
        {`
          @media print {
            body { background: white !important; color: black !important; }
            button, .no-print { display: none !important; }
            * { text-shadow: none !important; box-shadow: none !important; }
            .print-border { border: 1px solid #ccc !important; }
            .print-text { color: black !important; }
            .print-muted { color: #666 !important; }
          }
        `}
      </style>
      
      <header className="no-print" style={{
        height: 64, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 50
      }}>
        <button onClick={() => navigate('/my-quotations')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Back
        </button>
        <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: C.cyan, color: '#003543', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', ...glow }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>download</span>
          Download PDF
        </button>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '3rem 2.5rem' }} className="print-border">
        {/* Header Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.5rem' }}>
              <h1 className="print-text" style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: 0, color: C.white }}>
                Quotation Details
              </h1>
              <span className="print-text" style={{ 
                padding: '4px 12px', borderRadius: 999, border: `1px solid ${getStatusColor(quote.status)}`,
                color: getStatusColor(quote.status), fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase'
              }}>
                {formatStatus(quote.status)}
              </span>
            </div>
            <p className="print-muted" style={{ color: C.slate, margin: '0 0 0.5rem', fontSize: '1rem' }}>
              Reference: <span style={{ color: C.white, fontWeight: 600 }}>{quote.quotation_reference || quote.id.split('-')[0].toUpperCase()}</span>
            </p>
            <p className="print-muted" style={{ color: C.slate, margin: 0, fontSize: '0.875rem' }}>
              Submitted on {new Date(quote.created_at).toLocaleDateString()} at {new Date(quote.created_at).toLocaleTimeString()}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
             <p className="print-muted" style={{ color: C.slate, margin: '0 0 0.5rem', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Total Value</p>
             <h2 className="print-text" style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: 0, color: C.cyan, lineHeight: 1 }}>
               {quote.currency || 'USD'} {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </h2>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
          
          {/* Price Breakdown */}
          <div style={{ ...glass, borderRadius: 16, padding: '2rem' }} className="print-border">
            <h3 className="print-text" style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: C.cyan }}>receipt_long</span> Price Breakdown
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: `1px solid ${C.border}` }}>
                <span className="print-muted" style={{ color: C.slate, fontSize: '0.875rem' }}>Base Service Fee</span>
                <span className="print-text" style={{ color: C.white, fontWeight: 600 }}>{quote.currency} {baseAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: `1px solid ${C.border}` }}>
                <span className="print-muted" style={{ color: C.slate, fontSize: '0.875rem' }}>Travel / Logistics</span>
                <span className="print-text" style={{ color: C.white, fontWeight: 600 }}>{quote.currency} {travel.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: `1px solid ${C.border}` }}>
                <span className="print-muted" style={{ color: C.slate, fontSize: '0.875rem' }}>Emergency Callout Fee</span>
                <span className="print-text" style={{ color: C.white, fontWeight: 600 }}>{quote.currency} {emergency.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: `1px solid ${C.border}` }}>
                <span className="print-muted" style={{ color: C.slate, fontSize: '0.875rem' }}>Taxes & Fees {quote.taxes_included ? '(Included)' : '(Est 10%)'}</span>
                <span className="print-text" style={{ color: C.white, fontWeight: 600 }}>{quote.currency} {taxes.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
                <span className="print-text" style={{ color: C.cyan, fontSize: '1rem', fontWeight: 700 }}>Total Quote</span>
                <span className="print-text" style={{ color: C.cyan, fontSize: '1.25rem', fontWeight: 800 }}>{quote.currency} {totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>

          {/* Timeline & Terms */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ ...glass, borderRadius: 16, padding: '2rem' }} className="print-border">
              <h3 className="print-text" style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.secondary }}>calendar_month</span> Timeline
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <p className="print-muted" style={{ fontSize: '0.75rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontWeight: 700 }}>Est. Start Date</p>
                  <p className="print-text" style={{ fontSize: '1rem', color: C.white, fontWeight: 600, margin: 0 }}>
                    {quote.estimated_start_date ? new Date(quote.estimated_start_date).toLocaleDateString() : 'TBD'}
                  </p>
                </div>
                <div>
                  <p className="print-muted" style={{ fontSize: '0.75rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontWeight: 700 }}>Est. Completion</p>
                  <p className="print-text" style={{ fontSize: '1rem', color: C.white, fontWeight: 600, margin: 0 }}>
                    {quote.estimated_completion_date ? new Date(quote.estimated_completion_date).toLocaleDateString() : 'TBD'}
                  </p>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <p className="print-muted" style={{ fontSize: '0.75rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontWeight: 700 }}>Duration</p>
                  <p className="print-text" style={{ fontSize: '1rem', color: C.white, fontWeight: 600, margin: 0 }}>
                    {quote.estimated_duration || 'Not specified'}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ ...glass, borderRadius: 16, padding: '2rem' }} className="print-border">
              <h3 className="print-text" style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: C.amber }}>handshake</span> Terms & Conditions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <p className="print-muted" style={{ fontSize: '0.75rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontWeight: 700 }}>Payment Terms</p>
                  <p className="print-text" style={{ fontSize: '0.875rem', color: C.white, margin: 0, lineHeight: 1.5 }}>
                    {quote.payment_terms || 'Standard 30 Days'}
                  </p>
                </div>
                <div>
                  <p className="print-muted" style={{ fontSize: '0.75rem', color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', fontWeight: 700 }}>Warranty Period</p>
                  <p className="print-text" style={{ fontSize: '0.875rem', color: C.white, margin: 0, lineHeight: 1.5 }}>
                    {quote.warranty_period || 'No warranty specified'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Proposal / Message */}
        <div style={{ ...glass, borderRadius: 16, padding: '2rem', marginBottom: '2rem' }} className="print-border">
          <h3 className="print-text" style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: C.purple }}>description</span> Proposal & Scope of Work
          </h3>
          <div className="print-text" style={{ color: C.text, fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {quote.message || 'No additional message or proposal was provided with this quotation.'}
          </div>
        </div>

        {/* Attachments */}
        <div style={{ ...glass, borderRadius: 16, padding: '2rem' }} className="print-border">
          <h3 className="print-text" style={{ fontFamily: fonts.manrope, fontSize: '1.25rem', fontWeight: 700, color: C.white, margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: C.dim }}>attachment</span> Attachments
          </h3>
          
          {quote.attachments && quote.attachments.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {quote.attachments.map((att: string, i: number) => {
                const fileName = att.split('/').pop() || `Attachment ${i + 1}`;
                return (
                  <a key={i} href={att} target="_blank" rel="noreferrer" style={{ 
                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', 
                    background: C.bgCardH, border: `1px solid ${C.border}`, borderRadius: 12, 
                    textDecoration: 'none', color: C.white, transition: 'all 0.2s'
                  }} className="no-print" onMouseEnter={e => e.currentTarget.style.borderColor = C.cyan} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                    <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: '1.5rem' }}>picture_as_pdf</span>
                    <span style={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="print-muted" style={{ color: C.slate, margin: 0, fontSize: '0.875rem' }}>No attachments were included with this quotation.</p>
          )}
        </div>

      </main>
    </div>
  );
};
