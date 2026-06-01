import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, X, Flame } from 'lucide-react';
import toast from 'react-hot-toast';
import { extinguisherAPI, customerAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import { format } from 'date-fns';

const TYPES = ['CO2', 'Dry Powder', 'Foam', 'Water'];
const STATUSES = ['active', 'expired', 'serviced', 'decommissioned', 'pending_inspection'];
const COMPLIANCE = ['compliant', 'warning', 'critical', 'non_compliant'];

const EMPTY_FORM = {
  serialNumber: '', type: 'CO2', capacityLiters: '', manufactureDate: '', purchaseDate: '',
  expiryDate: '', lastInspectionDate: '', nextInspectionDate: '', location: '', customerId: '', notes: '',
};

function complianceBadge(status) {
  const map = { compliant: 'badge-green', warning: 'badge-yellow', critical: 'badge-orange', non_compliant: 'badge-red' };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status?.replace('_', ' ')}</span>;
}

function statusBadge(status) {
  const map = { active: 'badge-green', expired: 'badge-red', serviced: 'badge-cyan', decommissioned: 'badge-gray', pending_inspection: 'badge-yellow' };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status?.replace('_', ' ')}</span>;
}

export default function ExtinguishersPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCompliance, setFilterCompliance] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [customers, setCustomers] = useState([]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await extinguisherAPI.list({ page, limit: 10, search, status: filterStatus, type: filterType, compliance: filterCompliance });
      setItems(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load extinguishers'); }
    finally { setLoading(false); }
  }, [page, search, filterStatus, filterType, filterCompliance]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    customerAPI.list({ limit: 100 }).then(r => setCustomers(r.data.data)).catch(() => {});
  }, []);

  const openCreate = () => { setForm(EMPTY_FORM); setErrors([]); setModal('create'); };
  const openEdit = (item) => {
    setSelected(item);
    setForm({
      serialNumber: item.serialNumber, type: item.type, capacityLiters: item.capacityLiters,
      manufactureDate: item.manufactureDate?.split('T')[0] || '',
      purchaseDate: item.purchaseDate?.split('T')[0] || '',
      expiryDate: item.expiryDate?.split('T')[0] || '',
      lastInspectionDate: item.lastInspectionDate?.split('T')[0] || '',
      nextInspectionDate: item.nextInspectionDate?.split('T')[0] || '',
      location: item.location, customerId: item.customerId, notes: item.notes || '',
    });
    setErrors([]); setModal('edit');
  };
  const openView = (item) => { setSelected(item); setModal('view'); };
  const closeModal = () => { setModal(null); setSelected(null); setErrors([]); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors([]);
    try {
      if (modal === 'create') {
        await extinguisherAPI.create(form);
        toast.success('Extinguisher registered');
      } else {
        await extinguisherAPI.update(selected.id, form);
        toast.success('Extinguisher updated');
      }
      closeModal(); fetchItems();
    } catch (err) {
      const errs = err.response?.data?.errors || [err.response?.data?.message || 'Save failed'];
      setErrors(errs);
    } finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Remove extinguisher ${item.extinguisherCode}?`)) return;
    try {
      await extinguisherAPI.delete(item.id);
      toast.success('Extinguisher removed');
      fetchItems();
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  const f = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—';

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Fire Extinguishers</h2>
          <p>Register and manage all fire extinguishers</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Add Extinguisher</button>
      </div>

      <div className="search-bar">
        <div className="search-input-wrap">
          <Search size={15} />
          <input className="form-control" placeholder="Search by code, serial, location, customer…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="form-control" style={{ width: 'auto' }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select className="form-control" style={{ width: 'auto' }} value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="form-control" style={{ width: 'auto' }} value={filterCompliance} onChange={e => { setFilterCompliance(e.target.value); setPage(1); }}>
          <option value="">All Compliance</option>
          {COMPLIANCE.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Code</th><th>Serial</th><th>Type</th><th>Location</th>
              <th>Customer</th><th>Expiry</th><th>Status</th><th>Compliance</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9}><div className="empty-state"><Flame /><h3>No extinguishers found</h3></div></td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td><strong className="mono">{item.extinguisherCode}</strong></td>
                <td className="mono">{item.serialNumber}</td>
                <td><span className="badge badge-cyan">{item.type}</span></td>
                <td>{item.location}</td>
                <td>{item.customerName}</td>
                <td style={{ color: new Date(item.expiryDate) < new Date() ? 'var(--danger)' : 'inherit' }}>{f(item.expiryDate)}</td>
                <td>{statusBadge(item.status)}</td>
                <td>{complianceBadge(item.complianceStatus)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-icon" title="View" onClick={() => openView(item)}><Eye size={14} /></button>
                    <button className="btn-icon" title="Edit" onClick={() => openEdit(item)}><Edit2 size={14} /></button>
                    {isAdmin && <button className="btn-icon" title="Delete" onClick={() => handleDelete(item)} style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {/* Create / Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === 'create' ? 'Register Extinguisher' : 'Edit Extinguisher'}</h3>
              <button className="btn-icon" onClick={closeModal}><X size={16} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {errors.length > 0 && <div className="alert alert-error">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Serial Number *</label>
                    <input className="form-control" value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type *</label>
                    <select className="form-control" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} required>
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Capacity (Liters) *</label>
                    <input type="number" step="0.1" className="form-control" value={form.capacityLiters} onChange={e => setForm({ ...form, capacityLiters: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Customer *</label>
                    <select className="form-control" value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })} required>
                      <option value="">Select customer…</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.fullName} {c.organizationName ? `(${c.organizationName})` : ''}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Manufacture Date *</label>
                    <input type="date" className="form-control" value={form.manufactureDate} onChange={e => setForm({ ...form, manufactureDate: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Purchase Date *</label>
                    <input type="date" className="form-control" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Expiry Date *</label>
                    <input type="date" className="form-control" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Last Inspection Date</label>
                    <input type="date" className="form-control" value={form.lastInspectionDate} onChange={e => setForm({ ...form, lastInspectionDate: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Next Inspection Date</label>
                    <input type="date" className="form-control" value={form.nextInspectionDate} onChange={e => setForm({ ...form, nextInspectionDate: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Location *</label>
                  <input className="form-control" placeholder="e.g. Building A, Floor 2, Near Exit" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Modal */}
      {modal === 'view' && selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Extinguisher Details — <span className="mono">{selected.extinguisherCode}</span></h3>
              <button className="btn-icon" onClick={closeModal}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item"><label>Code</label><span className="mono">{selected.extinguisherCode}</span></div>
                <div className="detail-item"><label>Serial Number</label><span className="mono">{selected.serialNumber}</span></div>
                <div className="detail-item"><label>Type</label><span>{selected.type}</span></div>
                <div className="detail-item"><label>Capacity</label><span>{selected.capacityLiters} L</span></div>
                <div className="detail-item"><label>Customer</label><span>{selected.customerName}</span></div>
                <div className="detail-item"><label>Organization</label><span>{selected.customerOrg || '—'}</span></div>
                <div className="detail-item"><label>Location</label><span>{selected.location}</span></div>
                <div className="detail-item"><label>Status</label>{statusBadge(selected.status)}</div>
                <div className="detail-item"><label>Compliance</label>{complianceBadge(selected.complianceStatus)}</div>
                <div className="detail-item"><label>Manufacture Date</label><span>{f(selected.manufactureDate)}</span></div>
                <div className="detail-item"><label>Purchase Date</label><span>{f(selected.purchaseDate)}</span></div>
                <div className="detail-item"><label>Expiry Date</label><span style={{ color: new Date(selected.expiryDate) < new Date() ? 'var(--danger)' : 'inherit' }}>{f(selected.expiryDate)}</span></div>
                <div className="detail-item"><label>Last Inspection</label><span>{f(selected.lastInspectionDate)}</span></div>
                <div className="detail-item"><label>Next Inspection</label><span>{f(selected.nextInspectionDate)}</span></div>
                {selected.notes && <div className="detail-item" style={{ gridColumn: '1/-1' }}><label>Notes</label><span>{selected.notes}</span></div>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Close</button>
              <button className="btn btn-primary" onClick={() => { closeModal(); openEdit(selected); }}>Edit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
