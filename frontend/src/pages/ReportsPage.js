import React, { useState } from 'react';
import { Download, BarChart3, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { reportAPI } from '../services/api';
import { format } from 'date-fns';

const REPORT_TYPES = [
  { key: 'expired', label: 'Expired Extinguishers', desc: 'All extinguishers past their expiry date' },
  { key: 'expiring-soon', label: 'Expiring Soon', desc: 'Extinguishers expiring within selected days' },
  { key: 'customers', label: 'Customer Report', desc: 'All customers with extinguisher counts' },
  { key: 'inspections', label: 'Inspection Report', desc: 'All inspection records' },
  { key: 'maintenance', label: 'Maintenance Report', desc: 'All maintenance records' },
  { key: 'compliance', label: 'Compliance Report', desc: 'Full compliance status overview' },
];

function complianceBadge(status) {
  const map = { compliant: 'badge-green', warning: 'badge-yellow', critical: 'badge-orange', non_compliant: 'badge-red' };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status?.replace('_', ' ')}</span>;
}

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState('expired');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [days, setDays] = useState(90);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    try {
      let res;
      const params = {};
      if (activeReport === 'expiring-soon') params.days = days;
      if (['inspections', 'maintenance'].includes(activeReport)) {
        if (dateFrom) params.from = dateFrom;
        if (dateTo) params.to = dateTo;
      }
      const apiMap = {
        expired: reportAPI.expired,
        'expiring-soon': reportAPI.expiringSoon,
        customers: reportAPI.customers,
        inspections: reportAPI.inspections,
        maintenance: reportAPI.maintenance,
        compliance: reportAPI.compliance,
      };
      res = await apiMap[activeReport](params);
      setData(res.data.data);
      setLoaded(true);
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  const downloadCsv = async () => {
    try {
      const params = {};
      if (activeReport === 'expiring-soon') params.days = days;
      const res = await reportAPI.downloadCsv(activeReport, params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeReport}-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('CSV downloaded');
    } catch { toast.error('Download failed'); }
  };

  const f = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—';

  const renderTable = () => {
    if (!loaded) return null;
    if (data.length === 0) return <div className="empty-state"><FileText /><h3>No data for this report</h3></div>;

    if (activeReport === 'expired' || activeReport === 'expiring-soon') {
      return (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Code</th><th>Serial</th><th>Type</th><th>Location</th><th>Customer</th><th>Expiry Date</th><th>{activeReport === 'expired' ? 'Days Overdue' : 'Days Left'}</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.extinguisher_code}</td>
                  <td className="mono">{r.serial_number}</td>
                  <td><span className="badge badge-cyan">{r.type}</span></td>
                  <td>{r.location}</td>
                  <td>{r.customer_name}</td>
                  <td style={{ color: 'var(--danger)' }}>{f(r.expiry_date)}</td>
                  <td><span className={`badge ${activeReport === 'expired' ? 'badge-red' : r.days_remaining <= 7 ? 'badge-red' : r.days_remaining <= 30 ? 'badge-yellow' : 'badge-cyan'}`}>{activeReport === 'expired' ? r.days_overdue : r.days_remaining}d</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeReport === 'customers') {
      return (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Organization</th><th>Phone</th><th>Total</th><th>Active</th><th>Expired</th><th>Non-Compliant</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.customer_code}</td>
                  <td><strong>{r.full_name}</strong></td>
                  <td>{r.organization_name || '—'}</td>
                  <td>{r.phone}</td>
                  <td>{r.total_extinguishers}</td>
                  <td><span className="badge badge-green">{r.active}</span></td>
                  <td><span className="badge badge-red">{r.expired}</span></td>
                  <td><span className="badge badge-yellow">{r.non_compliant}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeReport === 'inspections') {
      return (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Code</th><th>Inspector</th><th>Date</th><th>Status</th><th>Customer</th><th>Next Inspection</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.extinguisher_code}</td>
                  <td>{r.inspector_name}</td>
                  <td>{f(r.inspection_date)}</td>
                  <td><span className={`badge ${r.status === 'Passed' ? 'badge-green' : r.status === 'Failed' ? 'badge-red' : 'badge-yellow'}`}>{r.status}</span></td>
                  <td>{r.customer_name}</td>
                  <td>{f(r.next_inspection_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeReport === 'maintenance') {
      return (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Code</th><th>Service Date</th><th>Company</th><th>Technician</th><th>Cost</th><th>Status</th><th>Customer</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.extinguisher_code}</td>
                  <td>{f(r.service_date)}</td>
                  <td>{r.service_company}</td>
                  <td>{r.technician_name}</td>
                  <td>{r.cost > 0 ? `RWF ${parseFloat(r.cost).toLocaleString()}` : '—'}</td>
                  <td><span className={`badge ${r.status === 'completed' ? 'badge-green' : 'badge-yellow'}`}>{r.status}</span></td>
                  <td>{r.customer_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeReport === 'compliance') {
      return (
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Code</th><th>Location</th><th>Customer</th><th>Expiry</th><th>Days to Expiry</th><th>Compliance</th><th>Escalation</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.extinguisher_code}</td>
                  <td>{r.location}</td>
                  <td>{r.customer_name}</td>
                  <td>{f(r.expiry_date)}</td>
                  <td><span className={`badge ${r.days_to_expiry < 0 ? 'badge-red' : r.days_to_expiry <= 30 ? 'badge-yellow' : 'badge-green'}`}>{r.days_to_expiry}d</span></td>
                  <td>{complianceBadge(r.compliance_status)}</td>
                  <td>{r.escalation_stage > 0 ? <span className="badge badge-red">Stage {r.escalation_stage}</span> : <span className="badge badge-gray">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  return (
    <div>
      <div className="page-header">
        <div><h2>Reports</h2><p>Generate and export compliance and operational reports</p></div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Select Report</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {REPORT_TYPES.map(r => (
              <button
                key={r.key}
                className={`nav-item ${activeReport === r.key ? 'active' : ''}`}
                onClick={() => { setActiveReport(r.key); setLoaded(false); setData([]); }}
                style={{ flexDirection: 'column', alignItems: 'flex-start', height: 'auto', padding: '10px 14px' }}
              >
                <span style={{ fontWeight: 600 }}>{r.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{r.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Options</h3>
          {activeReport === 'expiring-soon' && (
            <div className="form-group">
              <label className="form-label">Days Window</label>
              <select className="form-control" value={days} onChange={e => setDays(e.target.value)}>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
          )}
          {['inspections', 'maintenance'].includes(activeReport) && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">From Date</label>
                <input type="date" className="form-control" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">To Date</label>
                <input type="date" className="form-control" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={fetchReport} disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generating…</> : <><BarChart3 size={15} /> Generate Report</>}
            </button>
            {loaded && data.length > 0 && (
              <button className="btn btn-secondary" onClick={downloadCsv}>
                <Download size={15} /> Export CSV
              </button>
            )}
          </div>
          {loaded && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>{data.length} records found</p>}
        </div>
      </div>

      {renderTable()}
    </div>
  );
}
