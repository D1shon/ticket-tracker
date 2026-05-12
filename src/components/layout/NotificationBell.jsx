import React, { useRef, useEffect } from 'react';
import { Bell, X, Check, CheckCheck, Trash2, MessageSquare, Paperclip, RefreshCw, PlusCircle } from 'lucide-react';
import { useNotifications } from '../../store/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { formatAuthor } from '../../utils/formatters';

const TYPE_ICONS = {
  status_change: <RefreshCw size={14} />,
  new_message:   <MessageSquare size={14} />,
  file_attached: <Paperclip size={14} />,
  new_ticket:    <PlusCircle size={14} />,
};

const TYPE_COLORS = {
  status_change: '#FB8F41',
  new_message:   '#4C94FF',
  file_attached: '#7B3DFF',
  new_ticket:    '#70B11D',
};

const STATUS_BADGE_COLORS = {
  in_progress: '#70B11D',
  paused:      '#FB8F41',
  waiting:     '#FFCA43',
  closed:      '#7B3DFF',
  new:         '#4C94FF',
};

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60)   return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} д назад`;
}

const NotificationBell = () => {
  const { notifications, readIds, unreadCount, panelOpen, setPanelOpen, markAllRead, markRead, clearAll } = useNotifications();
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const bellRef = useRef(null);

  // Close panel on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        bellRef.current && !bellRef.current.contains(e.target)
      ) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [setPanelOpen]);

  const handleNotifClick = (notif) => {
    markRead(notif.id);
    if (notif.ticketId) {
      setPanelOpen(false);
      navigate(`/tickets/${notif.ticketId}`);
    }
  };

  const handleToggle = () => {
    setPanelOpen(prev => !prev);
    if (!panelOpen && unreadCount > 0) {
      // Small delay so user sees the badge before it resets
      setTimeout(markAllRead, 800);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* ─── Bell Button ──────────────────────────────────────── */}
      <button
        ref={bellRef}
        onClick={handleToggle}
        id="notification-bell-btn"
        style={{
          position: 'relative',
          width: 38,
          height: 38,
          borderRadius: '12px',
          border: panelOpen
            ? '1px solid rgba(123,61,255,0.4)'
            : '1px solid var(--border)',
          background: panelOpen
            ? 'rgba(123,61,255,0.1)'
            : 'var(--bg-card)',
          color: panelOpen ? '#7B3DFF' : 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          boxShadow: panelOpen ? '0 0 0 3px rgba(123,61,255,0.12)' : 'var(--shadow-card)',
        }}
        aria-label="Уведомления"
      >
        <Bell
          size={17}
          style={{
            animation: unreadCount > 0 ? 'bell-ring 2.5s ease infinite' : 'none',
          }}
        />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            background: 'linear-gradient(135deg, #FF3850, #c0392b)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            border: '2px solid var(--bg-primary)',
            animation: 'badge-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)',
            letterSpacing: 0,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ─── Notification Panel ───────────────────────────────── */}
      {panelOpen && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: 56,
            right: 16,
            width: 360,
            maxHeight: 520,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 16px 64px rgba(0,0,0,0.35)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'slideDown 0.2s ease',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={15} color="var(--text-secondary)" />
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                Уведомления
              </span>
              {unreadCount > 0 && (
                <span style={{
                  background: 'rgba(255,56,80,0.12)',
                  color: '#FF3850',
                  border: '1px solid rgba(255,56,80,0.25)',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 7px',
                }}>
                  {unreadCount} новых
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={markAllRead}
                    title="Прочитать все"
                    style={{
                      width: 30, height: 30, borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    <CheckCheck size={14} />
                  </button>
                  <button
                    onClick={clearAll}
                    title="Очистить все"
                    style={{
                      width: 30, height: 30, borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,56,80,0.08)'; e.currentTarget.style.color = '#FF3850'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
              <button
                onClick={() => setPanelOpen(false)}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '48px 24px', gap: 10,
                color: 'var(--text-muted)',
              }}>
                <Bell size={32} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 13 }}>Уведомлений пока нет</span>
              </div>
            ) : (
              notifications.map((notif, idx) => {
                const isUnread = !readIds?.has?.(notif.id);
                const color = TYPE_COLORS[notif.type] || '#7B3DFF';
                const icon = TYPE_ICONS[notif.type];

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: idx < notifications.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      cursor: notif.ticketId ? 'pointer' : 'default',
                      background: isUnread ? `${color}08` : 'transparent',
                      transition: 'background 0.15s',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                    onMouseEnter={e => { if (notif.ticketId) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isUnread ? `${color}08` : 'transparent'; }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: `${color}18`,
                      border: `1px solid ${color}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color, flexShrink: 0, marginTop: 1,
                    }}>
                      {icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{
                          fontSize: 13, fontWeight: isUnread ? 700 : 500,
                          color: 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {notif.title}
                        </span>
                        {isUnread && (
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: color, flexShrink: 0,
                          }} />
                        )}
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--text-secondary)',
                        marginTop: 2, lineHeight: 1.4,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {notif.description}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {timeAgo(notif.createdAt)}
                        </span>
                        {notif.author && (
                          <>
                            <span style={{ color: 'var(--border)', fontSize: 10 }}>•</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {formatAuthor(notif.author)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
