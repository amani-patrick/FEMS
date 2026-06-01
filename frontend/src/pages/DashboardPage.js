import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Users, AlertTriangle, CheckCircle, Clock, ShieldX, TrendingUp, Wrench } from 'lucide-react';
import { reportAPI, extinguisherAPI } from '../services/api';
import { format } from 'date-fns';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [expiringSoon, setExpiringSoon] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      reportAPI.summary(),
      reportAPI.expiringSoon({ days: 30 }),
    ]).then(([sumRes, expRes]) => {
      setSummary(sumRes.data.data);
      setExpiringSoon(expRes.data.data.slice(0, 5));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-full"><div className="spinner" /></div>;

  const ext = summary?.extinguishers || {};
  const cust = summary?.customers || {};

  const stats = [
    { label: 'Total Extinguishers', value: ext.total || 0, icon: Flame, color: 'cyan' },
    { label: 'Active', value: ext.active || 0, icon: CheckCircle, color: 'green' },
    { label: 'Expired', value: ext.expired || 0, icon: AlertTriangle, color: 'red' },
    { label: 'Expiring (30d)', value: ext.expiring_30d || 0, icon: Clock, color: 'yellow' },
    { label: 'Non-Compliant', value: ext.non_compliant || 0, icon: ShieldX, color: 'red' },
    { label: 'Total Customers', value: cust.total || 0, icon: Users, color: 'cyan' },
    { label: 'Serviced', value: ext.serviced || 0, icon: Wrench, color: 'orange' },
    { label: 'Expiring (90d)', value: ext.expiring_90d || 0, icon: TrendingUp, color: 'yellow' },
  ];

  function complianceBadge(status) {
    const map = { compliant: 'badge-green', warning: 'badge-yellow', critical: 'badge-orange', non_compliant: 'badge-red' };
    return <span className={`badge ${map[status] || 'badge-gray'}`}>{status?.replace('_', ' ')}</span>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Fire Extinguisher Management & Compliance Overview</p>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div className={`stat-icon ${s.color}`}><s.icon size={22} /></div>
            <div className="stat-info">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 8 }}>
        {/* Expiring soon */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>⚠️ Expiring Within 30 Days</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/extinguishers?compliance=critical')}>
              View All
            </button>
          </div>
          {expiringSoon.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <CheckCircle size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p>No extinguishers expiring soon</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Location</th>
                    <th>Expiry</th>
                    <th>Days Left</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringSoon.map(e => (
                    <tr key={e.extinguisher_code} style={{ cursor: 'pointer' }} onClick={() => navigate('/extinguishers')}>
                      <td><strong className="mono">{e.extinguisher_code}</strong></td>
                      <td>{e.location}</td>
                      <td>{e.expiry_date ? format(new Date(e.expiry_date), 'dd MMM yyyy') : '—'}</td>
                      <td>
                        <span className={`badge ${e.days_remaining <= 7 ? 'badge-red' : e.days_remaining <= 30 ? 'badge-yellow' : 'badge-cyan'}`}>
                          {e.days_remaining}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📊 Last 30 Days Activity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-dim)' }}>Inspections Conducted</span>
              <strong style={{ fontSize: 20, color: 'var(--accent)' }}>{summary?.inspections_last30d?.total || 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-dim)' }}>Inspections Passed</span>
              <strong style={{ fontSize: 20, color: 'var(--success)' }}>{summary?.inspections_last30d?.passed || 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-dim)' }}>Maintenance Records</span>
              <strong style={{ fontSize: 20, color: 'var(--warning)' }}>{summary?.maintenance_last30d?.total || 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-dim)' }}>Critical Compliance Issues</span>
              <strong style={{ fontSize: 20, color: 'var(--danger)' }}>{ext.critical || 0}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
