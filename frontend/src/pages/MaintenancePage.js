import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, X, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import { maintenanceAPI, extinguisherAPI } from '../services/api';
import Pagination from '../components/Pagination';
import { format } from 'date-fns';

const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];
const EMPTY_FORM = { extinguisherId: '', serviceDate: '', serviceCompany: '', technicianName: '', nextServiceDate: '', cost: '', description: '', status: 'completed' };

function statusBadge(s) {
  const map = { completed: 'badge-green', scheduled: 'badge-cyan', in_progress: 'badge-yellow', cancelled: 'badge-red' };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s.replace('_', ' ')}</span>;
}

export default function MaintenancePage() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [extinguishers, setExtinguishers] = useState([]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await maintenanceAPI.list({ page, limit: 10, status: filterStatus });
      setItems(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load maintenance records'); }
    finally { setLoading(false); }
  }, [page, filterStatus]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => {
    extinguisherAPI.list({ limit: 200 }).then(r => setExtinguishers(r.data.data)).catch(() => {});
  }, []);

  const openCreate = () => { setForm({ ...EMPTY_FORM, serviceDate: new Date().toISOString().split('T')[0] }); setErrors([]); setModal('create'); };
  const openView = (item) => { setSelected(item); setModal('view'); };
  const closeModal = () => { setModal(null); setSelected(null); setErrors([]); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors([]);
    try {
      await maintenanceAPI.create(form);
      toast.success('Maintenance record created');
      closeModal(); fetchItems();
    } catch (err) {
      const errs = err.response?.data?.errors || [err.response?.data?.message || 'Save failed'];
      setErrors(errs);
    } finally { setSaving(false); }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      await maintenanceAPI.updateStatus(id, status);
      toast.success('Status updated');
      fetchItems();
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed'); }
  };

  const f = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—';

  return (
    <div>
      <div className="page-header">
        <div><h2>Maintenance</h2><p>Schedule and track fire extinguisher maintenance</p></div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Add Record</button>
      </div>

      <div className="search-bar">
        <select className="form-control" style={{ width: 'auto' }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr><th>Extinguisher</th><th>Service Date</th><th>Company</th><th>Technician</th><th>Cost</th><th>Status</th><th>Next Service</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8}><div className="empty-state"><Wrench /><h3>No maintenance records found</h3></div></td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td><strong className="mono">{item.extinguisherCode}</strong></td>
                <td>{f(item.serviceDate)}</td>
                <td>{item.serviceCompany}</td>
                <td>{item.technicianName}</td>
                <td>{item.cost > 0 ? `RWF ${item.cost.toLocaleString()}` : '—'}</td>
                <td>{statusBadge(item.status)}</td>
                <td>{f(item.nextServiceDate)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-icon" title="View" onClick={() => openView(item)}><Eye size={14} /></button>
                    {item.status === 'scheduled' && (
                      <button className="btn btn-sm btn-success" onClick={() => handleStatusUpdate(item.id, 'completed')}>Complete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {modal === 'create' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Maintenance Record</h3>
              <button className="btn-icon" onClick={closeModal}><X size={16} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {errors.length > 0 && <div className="alert alert-error">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
                <div className="form-group">
                  <label className="form-label">Extinguisher *</label>
                  <select className="form-control" value={form.extinguisherId} onChange={e => setForm({ ...form, extinguisherId: e.target.value })} required>
                    <option value="">Select extinguisher…</option>
                    {extinguishers.map(e => <option key={e.id} value={e.id}>{e.extinguisherCode} — {e.location}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Service Company *</label>
                    <input className="form-control" value={form.serviceCompany} onChange={e => setForm({ ...form, serviceCompany: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Technician Name *</label>
                    <input className="form-control" value={form.technicianName} onChange={e => setForm({ ...form, technicianName: e.target.value })} required />
                  </div>
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Service Date *</label>
                    <input type="date" className="form-control" value={form.serviceDate} onChange={e => setForm({ ...form, serviceDate: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Next Service Date</label>
                    <input type="date" className="form-control" value={form.nextServiceDate} onChange={e => setForm({ ...form, nextServiceDate: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cost (RWF)</label>
                    <input type="number" className="form-control" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                      {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-control" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Describe the maintenance work…" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'view' && selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Maintenance Details</h3>
              <button className="btn-icon" onClick={closeModal}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item"><label>Extinguisher</label><span className="mono">{selected.extinguisherCode}</span></div>
                <div className="detail-item"><label>Status</label>{statusBadge(selected.status)}</div>
                <div className="detail-item"><label>Service Company</label><span>{selected.serviceCompany}</span></div>
                <div className="detail-item"><label>Technician</label><span>{selected.technicianName}</span></div>
                <div className="detail-item"><label>Service Date</label><span>{f(selected.serviceDate)}</span></div>
                <div className="detail-item"><label>Next Service</label><span>{f(selected.nextServiceDate)}</span></div>
                <div className="detail-item"><label>Cost</label><span>{selected.cost > 0 ? `RWF ${selected.cost.toLocaleString()}` : '—'}</span></div>
                {selected.description && <div className="detail-item" style={{ gridColumn: '1/-1' }}><label>Description</label><span>{selected.description}</span></div>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
