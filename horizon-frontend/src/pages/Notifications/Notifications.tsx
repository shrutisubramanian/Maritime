import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsService, Notification } from '../../services/notifications';

/* ── Design tokens ── */
const C = {
  bg:        '#0d141d',
  bgCard:    '#19202a',
  bgCardH:   '#242a34',
  bgLow:     '#151c26',
  border:    'rgba(255,255,255,0.05)',
  text:      '#dce3f0',
  muted:     '#c4c6ce',
  slate:     '#64748b',
  cyan:      '#4cd6ff',
  dim:       '#8e9098',
  white:     '#ffffff',
  error:     '#ffb4ab',
  primary:   '#9ccaff',
};

const fonts = { manrope: "'Manrope', sans-serif", inter: "'Inter', sans-serif" };

type FilterType = 'all' | 'unread' | 'read';

export const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await notificationsService.getNotifications();
      setNotifications(data);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      setProcessing(id);
      await notificationsService.markAsRead(id);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
      alert('Failed to mark notification as read');
    } finally {
      setProcessing(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setProcessing('all');
      await notificationsService.markAllAsRead();
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
      alert('Failed to mark all as read');
    } finally {
      setProcessing(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setProcessing(id);
      await notificationsService.deleteNotification(id);
      setNotifications(notifications.filter(n => n.id !== id));
    } catch (err) {
      console.error(err);
      alert('Failed to delete notification');
    } finally {
      setProcessing(null);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'quote': return 'request_quote';
      case 'job': return 'work';
      case 'review': return 'star';
      case 'verification': return 'verified';
      default: return 'notifications';
    }
  };

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') return notifications.filter(n => !n.is_read);
    if (filter === 'read') return notifications.filter(n => n.is_read);
    return notifications;
  }, [notifications, filter]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: fonts.inter, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── TOP NAV ── */}
      <header style={{
        height: 64, background: 'rgba(13,20,29,0.8)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', padding: '0 2.5rem', borderBottom: `1px solid ${C.border}`
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>arrow_back</span>
          Back
        </button>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '3rem 2.5rem', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontFamily: fonts.manrope, fontSize: '2.5rem', fontWeight: 800, margin: '0 0 0.5rem', color: C.white }}>Notifications</h1>
            <p style={{ color: C.slate, margin: 0, fontSize: '0.875rem' }}>You have {unreadCount} unread messages.</p>
          </div>
          {unreadCount > 0 && (
            <button 
              onClick={handleMarkAllAsRead}
              disabled={processing === 'all'}
              style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.cyan, padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: processing === 'all' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>done_all</span>
              {processing === 'all' ? 'Marking...' : 'Mark all as read'}
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: `1px solid ${C.border}` }}>
          {(['all', 'unread', 'read'] as FilterType[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: 'none', border: 'none', padding: '0.75rem 0',
                color: filter === f ? C.cyan : C.slate,
                fontWeight: filter === f ? 700 : 500,
                fontSize: '0.875rem', textTransform: 'capitalize', cursor: 'pointer',
                borderBottom: filter === f ? `2px solid ${C.cyan}` : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.2s'
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: C.slate }}>Loading notifications...</div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', background: C.bgLow, borderRadius: 24, border: `1px dashed ${C.border}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: C.slate, marginBottom: '1rem' }}>notifications_off</span>
            <p style={{ color: C.muted, margin: 0 }}>No notifications found.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredNotifications.map(n => (
              <div key={n.id} style={{ 
                display: 'flex', gap: '1.5rem', padding: '1.5rem', borderRadius: 16, 
                background: n.is_read ? C.bgLow : C.bgCardH, 
                border: `1px solid ${n.is_read ? C.border : 'rgba(76,214,255,0.2)'}`,
                transition: 'transform 0.2s',
                boxShadow: n.is_read ? 'none' : '0 10px 30px rgba(0,209,255,0.05)'
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${C.border}` }}>
                  <span className="material-symbols-outlined" style={{ color: n.is_read ? C.slate : C.cyan }}>{getIconForType(n.type)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h4 style={{ fontFamily: fonts.manrope, fontSize: '1rem', fontWeight: 700, color: n.is_read ? C.muted : C.white, margin: 0 }}>{n.title}</h4>
                    <span style={{ fontSize: '0.7rem', color: C.dim }}>{new Date(n.created_at).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: C.slate, margin: '0 0 1rem', lineHeight: 1.5 }}>{n.message}</p>
                  
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    {!n.is_read && (
                      <button 
                        onClick={() => handleMarkAsRead(n.id)}
                        disabled={processing === n.id}
                        style={{ background: 'none', border: 'none', padding: 0, color: C.cyan, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>check_circle</span>
                        Mark as read
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(n.id)}
                      disabled={processing === n.id}
                      style={{ background: 'none', border: 'none', padding: 0, color: C.error, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: 0.8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>delete</span>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
