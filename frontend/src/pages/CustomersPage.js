import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, X, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { customerAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import { format } from 'date-fns';

const EMPTY_FORM = { fullName: '', nationalId: '', phone: '', email: '', address: '', organizationName: '' };

export default function CustomersPage() {
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'view'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customerAPI.list({ page, limit: 10, search });
      setCustomers(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load customers'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const openCreate = () => { setForm(EMPTY_FORM); setErrors([]); setModal('create'); };
  const openEdit = (c) => { setSelected(c); setForm({ fullName: c.fullName, nationalId: c.nationalId || '', phone: c.phone, email: c.email || '', address: c.address || '', organizationName: c.organizationName || '' }); setErrors([]); setModal('edit'); };
  const openView = (c) => { setSelected(c); setModal('view'); };
  const closeModal = () => { setModal(null); setSelected(null); setErrors([]); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors([]);
    try {
      if (modal === 'create') {
        await customerAPI.create(form);
        toast.success('Customer created');
      } else {
        await customerAPI.update(selected.id, form);
        toast.success('Customer updated');
      }
      closeModal();
      fetchCustomers();
    } catch (err) {
      const errs = err.response?.data?.errors || [err.response?.data?.message || 'Save failed'];
      setErrors(errs);
    } finally { setSaving(false); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete customer "${c.fullName}"? This will also remove all their extinguishers.`)) return;
    try {
      await customerAPI.delete(c.id);
      toast.success('Customer deleted');
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Customers</h2>
          <p>Manage registered customers and organizations</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> Add Customer
        </button>
      </div>

      <div className="search-bar">
        <div className="search-input-wrap">
          <Search size={15} />
          <input
            className="form-control"
            placeholder="Search by name, code, phone, organization…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Full Name</th>
              <th>Organization</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Extinguishers</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7}>
                <div className="empty-state"><Building2 /><h3>No customers found</h3></div>
              </td></tr>
            ) : customers.map(c => (
              <tr key={c.id}>
                <td><span className="mono">{c.customerCode}</span></td>
                <td><strong>{c.fullName}</strong></td>
                <td>{c.organizationName || '—'}</td>
                <td>{c.phone}</td>
                <td>{c.email || '—'}</td>
                <td><span className="badge badge-cyan">{c.extinguisherCount || 0}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-icon" title="View" onClick={() => openView(c)}><Eye size={14} /></button>
                    <button className="btn-icon" title="Edit" onClick={() => openEdit(c)}><Edit2 size={14} /></button>
                    {isAdmin && <button className="btn-icon" title="Delete" onClick={() => handleDelete(c)} style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>}
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === 'create' ? 'Add Customer' : 'Edit Customer'}</h3>
              <button className="btn-icon" onClick={closeModal}><X size={16} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {errors.length > 0 && (
                  <div className="alert alert-error">
                    {errors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input className="form-control" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">National ID</label>
                    <input className="form-control" value={form.nationalId} onChange={e => setForm({ ...form, nationalId: e.target.value })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Phone *</label>
                    <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input type="email" className="form-control" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Organization Name</label>
                  <input className="form-control" value={form.organizationName} onChange={e => setForm({ ...form, organizationName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <textarea className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Modal */}
      {modal === 'view' && selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Customer Details</h3>
              <button className="btn-icon" onClick={closeModal}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item"><label>Customer Code</label><span className="mono">{selected.customerCode}</span></div>
                <div className="detail-item"><label>Full Name</label><span>{selected.fullName}</span></div>
                <div className="detail-item"><label>National ID</label><span>{selected.nationalId || '—'}</span></div>
                <div className="detail-item"><label>Phone</label><span>{selected.phone}</span></div>
                <div className="detail-item"><label>Email</label><span>{selected.email || '—'}</span></div>
                <div className="detail-item"><label>Organization</label><span>{selected.organizationName || '—'}</span></div>
                <div className="detail-item"><label>Extinguishers</label><span>{selected.extinguisherCount || 0}</span></div>
                <div className="detail-item"><label>Status</label><span className={`badge ${selected.isActive ? 'badge-green' : 'badge-red'}`}>{selected.isActive ? 'Active' : 'Inactive'}</span></div>
                <div className="detail-item" style={{ gridColumn: '1/-1' }}><label>Address</label><span>{selected.address || '—'}</span></div>
                <div className="detail-item"><label>Registered</label><span>{selected.createdAt ? format(new Date(selected.createdAt), 'dd MMM yyyy') : '—'}</span></div>
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
