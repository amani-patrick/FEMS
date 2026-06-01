import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, CheckCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { notificationAPI } from '../services/api';
import Pagination from '../components/Pagination';
import { format } from 'date-fns';

const STAGE_LABELS = {
  1: 'Reminder',
  2: 'Urgent Warning',
  3: 'Safety Officer Alert',
  4: 'Regulatory Notice',
  5: 'Compliance Case',
};

const STAGE_COLORS = {
  1: 'badge-cyan',
  2: 'badge-yellow',
  3: 'badge-orange',
  4: 'badge-red',
  5: 'badge-red',
};

export default function EscalationsPage() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [resolveModal, setResolveModal] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationAPI.getEscalations({ page, limit: 10, status: filterStatus });
      setItems(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load escalations'); }
    finally { setLoading(false); }
  }, [page, filterStatus]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleResolve = async () => {
    setSaving(true);
    try {
      await notificationAPI.resolveEscalation(resolveModal.id, notes);
      toast.success('Escalation resolved');
      setResolveModal(null);
      setNotes('');
      fetchItems();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to resolve'); }
    finally { setSaving(false); }
  };

  const f = (d) => d ? format(new Date(d), 'dd MMM yyyy HH:mm') : '—';

  return (
    <div>
      <div className="page-header">
        <div><h2>Escalations</h2><p>Manage compliance escalation cases</p></div>
      </div>

      <div className="search-bar">
        <select className="form-control" style={{ width: 'auto' }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr><th>Extinguisher</th><th>Customer</th><th>Stage</th><th>Reason</th><th>Status</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7}><div className="empty-state"><ShieldAlert /><h3>No escalations found</h3></div></td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td><strong className="mono">{item.extinguisher_code}</strong></td>
                <td>{item.customer_name}</td>
                <td>
                  <span className={`badge ${STAGE_COLORS[item.stage] || 'badge-gray'}`}>
                    Stage {item.stage}: {STAGE_LABELS[item.stage]}
                  </span>
                </td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.reason}</td>
                <td>
                  <span className={`badge ${item.status === 'open' ? 'badge-red' : item.status === 'resolved' ? 'badge-green' : 'badge-yellow'}`}>
                    {item.status}
                  </span>
                </td>
                <td>{f(item.created_at)}</td>
                <td>
                  {item.status === 'open' && (
                    <button className="btn btn-sm btn-success" onClick={() => setResolveModal(item)}>
                      <CheckCircle size={13} /> Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {resolveModal && (
        <div className="modal-overlay" onClick={() => setResolveModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Resolve Escalation</h3>
              <button className="btn-icon" onClick={() => setResolveModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info">
                <ShieldAlert size={16} />
                <div>
                  <strong>{resolveModal.extinguisher_code}</strong> — Stage {resolveModal.stage}: {STAGE_LABELS[resolveModal.stage]}
                  <div style={{ marginTop: 4, fontSize: 12 }}>{resolveModal.reason}</div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Resolution Notes</label>
                <textarea className="form-control" value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Describe the action taken to resolve this escalation…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setResolveModal(null)}>Cancel</button>
              <button className="btn btn-success" onClick={handleResolve} disabled={saving}>
                {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Resolving…</> : <><CheckCircle size={14} /> Mark Resolved</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
