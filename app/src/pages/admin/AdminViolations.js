import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';

export default function AdminViolations() {
  const [violations, setViolations] = useState(() => {
    try {
      const cached = localStorage.getItem('admin_violations_list');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(() => {
    return !localStorage.getItem('admin_violations_list');
  });
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const hasCache = violations.length > 0;
      if (!hasCache) setLoading(true);
      try {
        const { data } = await api.get('/violations');
        setViolations(data.violations || []);
        localStorage.setItem('admin_violations_list', JSON.stringify(data.violations || []));
      } catch {}
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/violations/${deleteTarget}`);
      toast.success('Violation permanently deleted');
      setViolations(prev => prev.filter(v => v._id !== deleteTarget));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete violation');
    }
    setDeleteLoading(false);
  };

  const TYPES = useMemo(() => [...new Set(violations.map(v => v.type))], [violations]);
  const filtered = useMemo(() => violations.filter(v =>
    (!typeFilter || v.type === typeFilter) &&
    (!search || v.employee?.fullName?.toLowerCase().includes(search.toLowerCase()))
  ), [violations, typeFilter, search]);
  const sevColor = (s) => s === 'high' ? 'badge-danger' : s === 'medium' ? 'badge-warning' : 'badge-info';

  const SkeletonRow = () => (
    <tr style={{ animation: 'pulse 1.5s infinite ease-in-out' }}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', backgroundColor: 'var(--border-light)' }} />
          <div style={{ height: 16, width: 100, backgroundColor: 'var(--border-light)', borderRadius: 4 }} />
        </div>
      </td>
      <td><div style={{ height: 16, width: 140, backgroundColor: 'var(--border-light)', borderRadius: 4 }} /></td>
      <td><div style={{ height: 20, width: 80, backgroundColor: 'var(--border-light)', borderRadius: 10 }} /></td>
      <td><div style={{ height: 20, width: 60, backgroundColor: 'var(--border-light)', borderRadius: 10 }} /></td>
      <td><div style={{ height: 16, width: 120, backgroundColor: 'var(--border-light)', borderRadius: 4 }} /></td>
      <td><div style={{ height: 28, width: 28, backgroundColor: 'var(--border-light)', borderRadius: 6 }} /></td>
    </tr>
  );

  return (
    <div>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Violation Reports</h1>
          <p>Monitor cheating violations</p>
        </div>
        <div className="page-actions">
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 38, width: 200, marginBottom: 0 }} />
          </div>
          <select className="form-input form-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 160, marginBottom: 0 }}>
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="card" style={{ marginTop: 24, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th>Employee</th><th>Assessment</th><th>Type</th><th>Severity</th><th>Time</th><th>Actions</th></tr></thead>
          <tbody>
            {loading && violations.length === 0 ? (
              [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
            ) : (
              filtered.map((v, i) => (
                <motion.tr key={v._id ? `${v._id}-${i}` : i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar" style={{ width: 30, height: 30, fontSize: 12, background: 'var(--gradient-danger)' }}>{v.employee?.fullName?.[0]}</div>
                    <div><div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{v.employee?.fullName}</div></div>
                  </div></td>
                  <td style={{ fontSize: 13 }}>{v.assessment?.title}</td>
                  <td><span className="badge badge-warning">{v.type?.replace(/-/g, ' ')}</span></td>
                  <td><span className={`badge ${sevColor(v.severity)}`}>{v.severity}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(v.timestamp).toLocaleString()}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(v._id)} title="Delete">
                      <Trash2 size={14} color="var(--danger)" />
                    </button>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && <div className="empty-state"><AlertTriangle size={48} /><h3>No violations</h3></div>}
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleteLoading}
        title="Delete Violation"
        message="Are you sure you want to permanently delete this violation? This action cannot be undone."
      />
    </div>
  );
}
