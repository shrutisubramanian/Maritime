import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsService } from '../../services/jobs';

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
  green:     '#22c55e',
  error:     '#ffb4ab',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

export const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const data = await jobsService.getUserJobs();
        setOrders(data || []);
      } catch (e) {
        console.error('Failed to fetch orders', e);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter(o => o.status === filter);

  const getStatusColor = (status: string) => {
    if (status === 'active') return C.cyan;
    if (status === 'completed') return C.green;
    if (status === 'cancelled') return C.error;
    return C.dim;
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── TOP NAV ── */}
      <header style={{
        height: 64, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`
      }}>
        <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Dashboard
        </button>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', width: '100%', padding: '3rem 2.5rem', flex: 1 }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: C.white }}>My Orders</h1>
          <p style={{ color: C.slate, margin: 0, fontSize: '1rem' }}>Manage and track all your active and past service orders.</p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button onClick={() => setFilter('active')} style={{ padding: '0.75rem 1.5rem', borderRadius: 12, border: 'none', background: filter === 'active' ? C.cyan : C.bgLow, color: filter === 'active' ? '#001f28' : C.white, fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
            Active Orders
          </button>
          <button onClick={() => setFilter('completed')} style={{ padding: '0.75rem 1.5rem', borderRadius: 12, border: 'none', background: filter === 'completed' ? C.cyan : C.bgLow, color: filter === 'completed' ? '#001f28' : C.white, fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
            Completed Orders
          </button>
        </div>

        <div style={{ background: C.bgLow, borderRadius: 24, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: C.bgLowest, fontSize: '0.65rem', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>
                  <th style={{ padding: '1.25rem 1.5rem' }}>Order ID</th>
                  <th style={{ padding: '1.25rem 1.5rem' }}>Service Type</th>
                  <th style={{ padding: '1.25rem 1.5rem' }}>Provider</th>
                  <th style={{ padding: '1.25rem 1.5rem' }}>Status</th>
                  <th style={{ padding: '1.25rem 1.5rem' }}>Total Amount</th>
                  <th style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: C.slate }}>Loading orders...</td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: C.dim }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: C.slate, marginBottom: '0.5rem' }}>inbox</span>
                      <p style={{ margin: 0 }}>You have no {filter} orders yet.</p>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} style={{ borderTop: `1px solid ${C.border}`, transition: 'background 0.2s', cursor: 'pointer' }}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      
                      <td style={{ padding: '1rem 1.5rem', color: C.dim, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {order.id.substring(0, 8)}
                      </td>
                      
                      <td style={{ padding: '1rem 1.5rem', fontWeight: 700, color: C.white }}>
                        {order.request?.service_type || 'Unknown Service'}
                      </td>
                      
                      <td style={{ padding: '1rem 1.5rem', color: C.slate }}>
                        {order.provider?.company_name || 'Unknown Provider'}
                      </td>
                      
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusColor(order.status) }} />
                          <span style={{ color: getStatusColor(order.status), fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize' }}>
                            {order.status}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '1rem 1.5rem', fontFamily: fonts.manrope, fontWeight: 700, color: C.white }}>
                        {order.quote?.currency} {order.quote?.amount ? parseFloat(order.quote.amount).toLocaleString() : '0.00'}
                      </td>

                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700 }}>
                          Details <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>arrow_forward</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
