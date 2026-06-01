import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { notificationAPI, authAPI } from '../services/api';
import {
  LayoutDashboard, Users, Flame, ClipboardCheck, Wrench,
  Bell, BarChart3, LogOut, ShieldAlert, Menu, X, FileText, KeyRound
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/customers', label: 'Customers', icon: Users },
  { path: '/extinguishers', label: 'Extinguishers', icon: Flame },
  { path: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { path: '/maintenance', label: 'Maintenance', icon: Wrench },
];

const adminItems = [
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/escalations', label: 'Escalations', icon: ShieldAlert },
  { path: '/users', label: 'Users', icon: FileText },
];

export default function Layout() {
  const { user, logout, isAdmin, isSafetyOfficer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [changePwModal, setChangePwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwErrors, setPwErrors] = useState([]);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  async function fetchNotifications() {
    try {
      const res = await notificationAPI.list({ limit: 15 });
      setNotifications(res.data.data);
      setUnreadCount(res.data.unreadCount);
    } catch {}
  }

  async function handleMarkRead(id) {
    try {
      await notificationAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  }

  async function handleMarkAllRead() {
    try {
      await notificationAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwErrors([]);
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwErrors(['New passwords do not match']);
      return;
    }
    setPwLoading(true);
    try {
      await authAPI.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      import('react-hot-toast').then(({ default: toast }) => toast.success('Password changed successfully'));
      setChangePwModal(false);
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      const errs = err.response?.data?.errors || [err.response?.data?.message || 'Failed to change password'];
      setPwErrors(errs);
    } finally {
      setPwLoading(false);
    }
  };

  const pageTitle = [...navItems, ...adminItems].find(i => location.pathname.startsWith(i.path))?.label || 'FEMCS';

  return (
    <div className="layout">
      {/* Sidebar overlay for mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? '' : 'hidden'}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h2>🧯 FEMCS</h2>
          <span>Fire Extinguisher Management</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-label">Main</div>
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </div>

          {(isAdmin || isSafetyOfficer) && (
            <div className="nav-section">
              <div className="nav-section-label">Management</div>
              {adminItems.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="user-info">
              <strong>{user?.firstName} {user?.lastName}</strong>
              <small>{user?.role?.replace('_', ' ')}</small>
            </div>
            <button className="logout-btn" title="Change password" onClick={() => setChangePwModal(true)} style={{ marginRight: 2 }}>
              <KeyRound size={14} />
            </button>
            <button className="logout-btn" onClick={handleLogout} title="Logout">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <button className="notif-bell" onClick={() => setNotifOpen(!notifOpen)}>
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
          </div>
        </header>

        {/* Notification panel */}
        {notifOpen && (
          <div className="notif-panel">
            <div className="notif-panel-header">
              <h3>Notifications {unreadCount > 0 && <span className="badge badge-red" style={{ marginLeft: 8 }}>{unreadCount}</span>}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {unreadCount > 0 && (
                  <button className="btn btn-sm btn-secondary" onClick={handleMarkAllRead}>
                    Mark all read
                  </button>
                )}
                <button className="btn-icon" onClick={() => setNotifOpen(false)}>
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="notif-list">
              {notifications.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px 20px' }}>
                  <Bell size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p>No notifications</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className={`notif-item ${!n.isRead ? `unread ${n.type}` : ''}`}
                    onClick={() => !n.isRead && handleMarkRead(n.id)}
                  >
                    <div className="notif-item-title">{n.title}</div>
                    <div className="notif-item-msg">{n.message}</div>
                    <div className="notif-item-time">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="page-content">
          <Outlet />
        </div>
      </div>

      {/* Change Password Modal */}
      {changePwModal && (
        <div className="modal-overlay" onClick={() => setChangePwModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><KeyRound size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />Change Password</h3>
              <button className="btn-icon" onClick={() => setChangePwModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="modal-body">
                {pwErrors.length > 0 && (
                  <div className="alert alert-error">
                    {pwErrors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Current Password *</label>
                  <input type="password" className="form-control" value={pwForm.currentPassword}
                    onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} required autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">New Password *</label>
                  <input type="password" className="form-control" value={pwForm.newPassword}
                    onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} required
                    placeholder="Min. 8 chars, upper, lower, number, special" />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password *</label>
                  <input type="password" className="form-control" value={pwForm.confirmPassword}
                    onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })} required
                    style={{ borderColor: pwForm.confirmPassword ? pwForm.newPassword === pwForm.confirmPassword ? 'var(--success)' : 'var(--danger)' : undefined }} />
                  {pwForm.confirmPassword && pwForm.newPassword !== pwForm.confirmPassword && (
                    <div className="form-error">Passwords do not match</div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setChangePwModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={pwLoading || pwForm.newPassword !== pwForm.confirmPassword}>
                  {pwLoading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
