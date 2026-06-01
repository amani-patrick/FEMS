import React, { useState, useEffect, useCallback } from 'react';
import { Search, UserCheck, UserX, Shield, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';
import Pagination from '../components/Pagination';
import { format } from 'date-fns';

const ROLES = ['admin', 'technician', 'inspector', 'safety_officer'];

function roleBadge(role) {
  const map = { admin: 'badge-red', safety_officer: 'badge-orange', inspector: 'badge-cyan', technician: 'badge-green' };
  return <span className={`badge ${map[role] || 'badge-gray'}`}>{role?.replace('_', ' ')}</span>;
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [roleModal, setRoleModal] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authAPI.getUsers({ page, limit: 10, search });
      setUsers(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleToggle = async (user) => {
    try {
      await authAPI.toggleUser(user.id);
      toast.success(`User ${user.isActive ? 'deactivated' : 'activated'}`);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleRoleChange = async () => {
    setSaving(true);
    try {
      await authAPI.updateRole(roleModal.id, newRole);
      toast.success('Role updated');
      setRoleModal(null);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div><h2>Users</h2><p>Manage system users and roles</p></div>
      </div>

      <div className="search-bar">
        <div className="search-input-wrap">
          <Search size={15} />
          <input className="form-control" placeholder="Search users…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6}><div className="empty-state"><h3>No users found</h3></div></td></tr>
            ) : users.map(u => (
              <tr key={u.id}>
                <td><strong>{u.firstName} {u.lastName}</strong></td>
                <td>{u.email}</td>
                <td>{roleBadge(u.role)}</td>
                <td><span className={`badge ${u.isActive ? 'badge-green' : 'badge-red'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>{u.createdAt ? format(new Date(u.createdAt), 'dd MMM yyyy') : '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => handleToggle(u)}
                      title={u.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {u.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => { setRoleModal(u); setNewRole(u.role); }}
                    >
                      <Shield size={13} /> Role
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {roleModal && (
        <div className="modal-overlay" onClick={() => setRoleModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change Role</h3>
              <button className="btn-icon" onClick={() => setRoleModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, color: 'var(--text-dim)' }}>
                Changing role for <strong>{roleModal.firstName} {roleModal.lastName}</strong>
              </p>
              <div className="form-group">
                <label className="form-label">New Role</label>
                <select className="form-control" value={newRole} onChange={e => setNewRole(e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRoleModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRoleChange} disabled={saving || newRole === roleModal.role}>
                {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
