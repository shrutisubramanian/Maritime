import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jobsService } from '../../services/jobs';

/* ── Design tokens ── */
const C = {
  bg:        '#0d141d',
  bgCardH:   '#242a34',
  bgLow:     '#151c26',
  border:    'rgba(255,255,255,0.05)',
  text:      '#dce3f0',
  muted:     '#c4c6ce',
  slate:     '#64748b',
  cyan:      '#4cd6ff',
  dim:       '#8e9098',
  white:     '#ffffff',
  primary:   '#9ccaff',
  green:     '#22c55e',
  error:     '#ffb4ab',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export const OrderDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchOrder = async () => {
      try {
        const data = await jobsService.getJobById(id);
        setOrder(data);
      } catch (e) {
        console.error('Failed to fetch order', e);
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [id]);

  const handleAction = async (action: 'complete' | 'cancel') => {
    try {
      setProcessing(true);
      if (action === 'complete') {
        const res = await jobsService.completeJob(id!);
        setOrder(res);
      } else {
        const res = await jobsService.cancelJob(id!);
        setOrder(res);
      }
    } catch (err) {
      console.error(`Failed to ${action} order`, err);
      alert(`Failed to ${action} order.`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div style={{ padding: '3rem', color: C.text, background: C.bg, minHeight: '100vh' }}>Loading...</div>;
  if (!order) return <div style={{ padding: '3rem', color: C.text, background: C.bg, minHeight: '100vh' }}>Order not found.</div>;

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      <header style={{
        height: 64, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`
      }}>
        <button onClick={() => navigate('/orders')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Back to Orders
        </button>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '3rem 2.5rem', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <span style={{ 
                padding: '4px 12px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                background: order.status === 'active' ? 'rgba(76,214,255,0.1)' : order.status === 'completed' ? 'rgba(34,197,94,0.1)' : 'rgba(255,180,171,0.1)',
                color: order.status === 'active' ? C.cyan : order.status === 'completed' ? C.green : C.error
              }}>
                {order.status}
              </span>
              <span style={{ color: C.slate, fontSize: '0.875rem', fontFamily: 'monospace' }}>ID: {order.id.substring(0, 8)}</span>
            </div>
            <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: C.white }}>
              {order.request?.service_type || 'Service Order'}
            </h1>
            <p style={{ color: C.dim, margin: 0, fontSize: '0.875rem' }}>Started on {new Date(order.created_at).toLocaleDateString()}</p>
          </div>
          
          {order.status === 'active' && (
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => handleAction('cancel')}
                disabled={processing}
                style={{ padding: '0.75rem 1.5rem', borderRadius: 8, background: 'rgba(255,180,171,0.1)', color: C.error, fontSize: '0.875rem', fontWeight: 700, border: `1px solid rgba(255,180,171,0.2)`, cursor: processing ? 'not-allowed' : 'pointer' }}>
                Cancel Order
              </button>
              <button 
                onClick={() => handleAction('complete')}
                disabled={processing}
                style={{ padding: '0.75rem 1.5rem', borderRadius: 8, background: C.cyan, color: '#001f28', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: processing ? 'not-allowed' : 'pointer' }}>
                Mark as Completed
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          {/* Details Card */}
          <div style={{ padding: '2rem', borderRadius: 24, background: C.bgLow, border: `1px solid ${C.border}` }}>
            <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1.2rem', color: C.white, margin: '0 0 1.5rem', letterSpacing: '0.05em' }}>Order Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate, display: 'block', marginBottom: 4 }}>Original Request</span>
                <p style={{ margin: 0, color: C.muted, fontSize: '0.875rem', lineHeight: 1.5 }}>{order.request?.description || 'N/A'}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate, display: 'block', marginBottom: 4 }}>Provider Quotes Remarks</span>
                <p style={{ margin: 0, color: C.muted, fontSize: '0.875rem', lineHeight: 1.5 }}>{order.quote?.message || 'None'}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '1rem', borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.slate }}>Agreed Amount</span>
                <span style={{ fontFamily: fonts.manrope, fontWeight: 900, fontSize: '1.1rem', color: C.white }}>{order.quote?.currency} {order.quote?.amount ? parseFloat(order.quote.amount).toLocaleString() : '0.00'}</span>
              </div>
            </div>
          </div>

          {/* Provider Card */}
          <div style={{ padding: '2rem', borderRadius: 24, background: C.bgLow, border: `1px solid ${C.border}` }}>
            <h3 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1.2rem', color: C.white, margin: '0 0 1.5rem', letterSpacing: '0.05em' }}>Provider Information</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: C.cyan }}>factory</span>
              </div>
              <div>
                <h4 style={{ fontFamily: fonts.manrope, fontWeight: 700, fontSize: '1.1rem', color: C.white, margin: '0 0 4px' }}>{order.provider?.company_name || 'Unknown Provider'}</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.cyan }}>
                  <span className="material-symbols-outlined fill" style={{ fontSize: '0.9rem' }}>star</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{order.provider?.rating_avg?.toFixed(1) || 'New'}</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => navigate(`/provider/${order.provider_id}`)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 8, background: 'transparent', color: C.white, fontSize: '0.875rem', fontWeight: 700, border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bgCardH)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              View Profile
            </button>
          </div>
        </div>

      </main>
    </div>
  );
};
