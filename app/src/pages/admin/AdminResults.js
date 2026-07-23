import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import api from '../../services/api';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import AdminExamDetailsDrawer from '../../components/AdminExamDetailsDrawer';
import toast from 'react-hot-toast';
import socket from '../../services/socket';

// ─── Safely resolve icons to prevent "Element type is invalid" errors ──────
const SafeIcon = ({ name, ...props }) => {
  const Icon = LucideIcons[name];
  return Icon ? <Icon {...props} /> : null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const COMPLETED_STATUSES = ['submitted', 'auto-submitted', 'completed', 'graded'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isPassed = (r) => r.passed === true || r.passed === 'true';

const getPct = (r) => {
  if (r.percentage != null && parseFloat(r.percentage) > 0) {
    return Math.round(parseFloat(r.percentage));
  }
  const marks = parseFloat(r.totalMarks);
  const score = parseFloat(r.totalScore);
  if (marks > 0 && score != null) return Math.round((score / marks) * 100);
  return 0;
};

const hasData = (r) => getPct(r) > 0 || parseFloat(r.totalScore) > 0 || parseFloat(r.totalMarks) > 0;

const fmtDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtTime = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function AdminResults() {
  const navigate = useNavigate();

  const [allResults, setAllResults] = useState(() => {
    try {
      const cached = localStorage.getItem('admin_results_list');
      const parsed = cached ? JSON.parse(cached) : [];
      return parsed.filter(r => COMPLETED_STATUSES.includes(r.status));
    } catch { return []; }
  });

  const [assessments, setAssessments] = useState(() => {
    try {
      const cached = localStorage.getItem('admin_assessments_list');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });

  const [filterAssessment, setFilterAssessment] = useState('');
  const [filterSearch,     setFilterSearch]     = useState('');
  const [currentPage,      setCurrentPage]      = useState(1);
  const itemsPerPage = 10;
  const [loading,        setLoading]        = useState(() => !localStorage.getItem('admin_results_list'));
  const [deleteTarget,   setDeleteTarget]   = useState(null);
  const [deleteLoading,  setDeleteLoading]  = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [activeCard, setActiveCard] = useState(null);

  const dashStats = useMemo(() => {
    const base = allResults.filter(r => COMPLETED_STATUSES.includes(r.status) && hasData(r));
    if (!base.length) return null;
    const passedCount = base.filter(isPassed).length;
    const avgPct = Math.round(base.reduce((s, r) => s + getPct(r), 0) / base.length);
    return {
      total:  base.length,
      passed: passedCount,
      failed: base.length - passedCount,
      avgPct,
    };
  }, [allResults]);

  const tableData = useMemo(() => {
    let arr = allResults.filter(r => COMPLETED_STATUSES.includes(r.status) && hasData(r));

    if (filterAssessment) arr = arr.filter(r => r.assessment?._id === filterAssessment);

    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      arr = arr.filter(r =>
        (r.employee?.fullName   || '').toLowerCase().includes(q) ||
        (r.employee?.email      || '').toLowerCase().includes(q) ||
        (r.employee?.employeeId || '').toLowerCase().includes(q) ||
        (r.assessment?.title    || '').toLowerCase().includes(q) ||
        (r.employee?.department || '').toLowerCase().includes(q)
      );
    }

    if (activeCard === 'total') {
      arr = [...arr].sort((a, b) => new Date(b.submittedAt || b.createdAt || 0) - new Date(a.submittedAt || a.createdAt || 0));
    } else if (activeCard === 'passed') {
      arr = arr.filter(isPassed);
      arr = [...arr].sort((a, b) => getPct(b) - getPct(a));
    } else if (activeCard === 'failed') {
      arr = arr.filter(r => !isPassed(r));
      arr = [...arr].sort((a, b) => getPct(b) - getPct(a));
    } else if (activeCard === 'avgscore') {
      arr = [...arr].sort((a, b) => getPct(b) - getPct(a));
    } else {
      arr = [...arr].sort((a, b) => new Date(b.submittedAt || b.createdAt || 0) - new Date(a.submittedAt || a.createdAt || 0));
    }

    return arr;
  }, [allResults, filterAssessment, filterSearch, activeCard]);

  const totalPages = Math.max(1, Math.ceil(tableData.length / itemsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return tableData.slice(start, start + itemsPerPage);
  }, [tableData, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [filterAssessment, filterSearch, activeCard]);

  const load = async () => {
    if (!allResults.length) setLoading(true);
    try {
      const [rRes, aRes] = await Promise.all([api.get('/results'), api.get('/assessments')]);
      const raw = (rRes.data.results || []).filter(r => COMPLETED_STATUSES.includes(r.status));
      setAllResults(raw);
      setAssessments(aRes.data.assessments || []);
      localStorage.setItem('admin_results_list', JSON.stringify(raw));
      localStorage.setItem('admin_assessments_list', JSON.stringify(aRes.data.assessments || []));
    } catch { }
    setLoading(false);
  };

  useEffect(() => {
    load();
    socket.on('db:sync', load);
    return () => { socket.off('db:sync', load); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/results/${deleteTarget}`);
      toast.success('Result permanently deleted');
      setAllResults(prev => prev.filter(r => r._id !== deleteTarget));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete result');
    }
    setDeleteLoading(false);
  };

  const exportCSV = () => {
    const headers = 'Rank,Candidate Name,Email,Exam Name,Pass/Fail,Percentage,Score,Total Marks,Correct,Wrong,Date\n';
    const rows = tableData.map((r, i) =>
      `${i + 1},"${r.employee?.fullName || ''}","${r.employee?.email || ''}","${r.assessment?.title || ''}","${isPassed(r) ? 'PASS' : 'FAIL'}",${getPct(r)}%,${r.totalScore || 0},${r.totalMarks || 0},${r.correctAnswers || 0},${r.wrongAnswers || 0},"${fmtDate(r.submittedAt)}"`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `results-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const cards = dashStats ? [
    { key: 'total',    iconName: 'Users',      label: 'Total Completed', value: dashStats.total,           color: '#10b981', glow: '#10b98130' },
    { key: 'passed',   iconName: 'Trophy',     label: 'Passed',          value: dashStats.passed,           color: '#10b981', glow: '#10b98130' },
    { key: 'failed',   iconName: 'XCircle',    label: 'Failed',          value: dashStats.failed,           color: '#ef4444', glow: '#ef444430' },
    { key: 'avgscore', iconName: 'TrendingUp', label: 'Avg Score',       value: `${dashStats.avgPct}%`,    color: '#6366f1', glow: '#6366f130' },
  ] : [];

  const SkeletonRow = () => (
    <tr style={{ animation: 'pulse 1.5s infinite ease-in-out' }}>
      {[40, 170, 140, 130, 70, 90, 70, 80, 90, 70].map((w, idx) => (
        <td key={idx}><div style={{ height: 14, width: w, backgroundColor: 'var(--border-light)', borderRadius: 4 }} /></td>
      ))}
    </tr>
  );

  const activeLabel = activeCard === 'total'    ? 'All Completed'
                    : activeCard === 'passed'   ? 'Passed only'
                    : activeCard === 'failed'   ? 'Failed only'
                    : activeCard === 'avgscore' ? 'Sorted by highest score'
                    : null;

  return (
    <div>
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Reports &amp; Analytics</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SafeIcon name="CheckCircle2" size={14} color="#10b981" />
            {activeLabel
              ? <span>Filter active: <strong style={{ color: 'var(--primary)' }}>{activeLabel}</strong></span>
              : 'Click a card to filter the table below'}
          </p>
        </div>
        <div className="page-actions">
          {activeCard && (
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveCard(null)} style={{ marginRight: 8 }}>
              <SafeIcon name="XCircle" size={14} /> Clear Filter
            </button>
          )}
          <button className="btn btn-secondary" onClick={exportCSV}>
            <SafeIcon name="Download" size={16} /> Export CSV
          </button>
        </div>
      </div>

      {cards.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 20 }}
        >
          {cards.map(({ key, iconName, label, value, color, glow }) => {
            const isActive = activeCard === key;
            return (
              <motion.div
                key={key}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveCard(prev => prev === key ? null : key)}
                title={isActive ? `Clear "${label}" filter` : `Filter table by: ${label}`}
                style={{
                  padding: '18px 20px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  cursor: 'pointer', borderRadius: 14,
                  background: isActive ? `${color}12` : 'var(--bg-card)',
                  border: `2px solid ${isActive ? color : 'var(--border)'}`,
                  boxShadow: isActive
                    ? `0 0 0 3px ${glow}, 0 4px 20px rgba(0,0,0,0.15)`
                    : '0 2px 8px rgba(0,0,0,0.06)',
                  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  userSelect: 'none', position: 'relative', overflow: 'hidden'
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg, ${color}, ${color}60)`,
                    borderRadius: '14px 14px 0 0'
                  }} />
                )}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: isActive ? `${color}25` : `${color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isActive ? `0 0 12px ${color}40` : 'none',
                  transition: 'all 0.2s ease'
                }}>
                  <SafeIcon name={iconName} size={20} color={color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 26, fontWeight: 800, lineHeight: 1.1,
                    color: isActive ? color : 'var(--text-primary)',
                    transition: 'color 0.2s ease'
                  }}>
                    {value}
                  </div>
                  <div style={{
                    fontSize: 12, marginTop: 3,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? color : 'var(--text-muted)',
                    transition: 'all 0.2s ease'
                  }}>
                    {label}{isActive ? ' ✓' : ''}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <SafeIcon name="Search" size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            style={{ paddingLeft: 36, marginBottom: 0 }}
            placeholder="Search name, email, department…"
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
          />
        </div>
        <select className="form-input form-select" value={filterAssessment} onChange={e => setFilterAssessment(e.target.value)}
          style={{ width: 200, marginBottom: 0 }}>
          <option value="">All Assessments</option>
          {assessments.map(a => <option key={a._id} value={a._id}>{a.title}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          <SafeIcon name="Filter" size={13} />
          {tableData.length} record{tableData.length !== 1 ? 's' : ''}
          {activeCard && <span style={{ color: 'var(--primary)', fontWeight: 600 }}> · {activeLabel}</span>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 0, overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {!loading && tableData.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ padding: '80px 20px', textAlign: 'center' }}
            >
              <SafeIcon name="XCircle" size={48} style={{ color: 'var(--border)', marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                No records found for this filter
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, margin: '0 auto' }}>
                {activeCard
                  ? 'No exam records match the selected filter. Click the card again or use the Clear Filter button.'
                  : filterSearch || filterAssessment
                    ? 'No records match your search. Try different keywords.'
                    : 'Results will appear here once employees complete their exams.'}
              </p>
              {activeCard && (
                <button className="btn btn-secondary" style={{ marginTop: 20 }} onClick={() => setActiveCard(null)}>
                  <SafeIcon name="XCircle" size={14} /> Clear Filter
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>#</th>
                      <th>Candidate Name</th>
                      <th>Email</th>
                      <th>Exam Name</th>
                      <th>Status</th>
                      <th>Percentage&nbsp;(%)</th>
                      <th>Score</th>
                      <th>Correct&nbsp;/&nbsp;Wrong</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && paginatedRows.length === 0
                      ? [...Array(6)].map((_, i) => <React.Fragment key={i}>{SkeletonRow()}</React.Fragment>)
                      : paginatedRows.map((r, i) => {
                          const globalRank = (currentPage - 1) * itemsPerPage + i;
                          const emp = r.employee || {};
                          const passed = isPassed(r);
                          const pct = getPct(r);
                          const pctColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

                          return (
                            <motion.tr
                              key={r._id ? `${r._id}-${i}` : i}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.018 }}
                            >
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {(activeCard === 'avgscore' || activeCard === 'passed') && globalRank < 3 && (
                                    <SafeIcon name="Trophy" size={11} color={['#fbbf24','#94a3b8','#cd7f32'][globalRank]} />
                                  )}
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{globalRank + 1}</span>
                                </div>
                              </td>

                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div className="avatar" style={{ width: 32, height: 32, fontSize: 12, flexShrink: 0, opacity: emp.notFound ? 0.5 : 1 }}>
                                    {(emp.fullName || '?')[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <div
                                      onClick={() => !emp.notFound && setSelectedUserId(emp._id || emp.employeeId)}
                                      style={{
                                        fontWeight: 600, fontSize: 13,
                                        color: emp.notFound ? 'var(--text-muted)' : 'var(--primary)',
                                        cursor: emp.notFound ? 'default' : 'pointer',
                                        textDecoration: emp.notFound ? 'none' : 'underline'
                                      }}
                                    >
                                      {emp.fullName || 'Employee Not Found'}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                      {emp.employeeId && (
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
                                          <SafeIcon name="Hash" size={9} />{emp.employeeId}
                                        </span>
                                      )}
                                      {emp.department && emp.department !== 'N/A' && (
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
                                          <SafeIcon name="Building2" size={9} />{emp.department}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                <span title={emp.email || '—'} style={{ display: 'block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {emp.email || '—'}
                                </span>
                              </td>

                              <td style={{ fontSize: 13, fontWeight: 500 }}>
                                {r.assessment?.title || '—'}
                              </td>

                              <td>
                                <span className={`badge ${passed ? 'badge-success' : 'badge-danger'}`}>
                                  {passed ? 'PASS' : 'FAIL'}
                                </span>
                              </td>

                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                                    <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
                                      <circle cx="18" cy="18" r="13" fill="none" stroke="var(--border-light)" strokeWidth="3" />
                                      <circle
                                        cx="18" cy="18" r="13" fill="none"
                                        stroke={pctColor} strokeWidth="3"
                                        strokeDasharray={`${2 * Math.PI * 13}`}
                                        strokeDashoffset={`${2 * Math.PI * 13 * (1 - pct / 100)}`}
                                        strokeLinecap="round"
                                        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                                      />
                                    </svg>
                                    <div style={{
                                      position: 'absolute', inset: 0,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: 8, fontWeight: 800, color: pctColor
                                    }}>
                                      {pct}
                                    </div>
                                  </div>
                                  <span style={{ fontSize: 15, fontWeight: 800, color: pctColor }}>
                                    {pct}%
                                  </span>
                                </div>
                              </td>

                              <td>
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
                                  {r.totalScore || 0}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/{r.totalMarks || 0}</span>
                              </td>

                              <td style={{ fontSize: 13 }}>
                                <span style={{ color: '#10b981', fontWeight: 600 }}>{r.correctAnswers || 0}</span>
                                {' / '}
                                <span style={{ color: '#ef4444', fontWeight: 600 }}>{r.wrongAnswers || 0}</span>
                              </td>

                              <td>
                                <div style={{ fontSize: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <SafeIcon name="Calendar" size={10} color="var(--text-muted)" />
                                  {fmtDate(r.submittedAt || r.endTime)}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {fmtTime(r.submittedAt || r.endTime)}
                                </div>
                              </td>

                              <td>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button className="btn btn-ghost btn-sm"
                                    onClick={() => navigate(`/admin/results/${r._id}`)}
                                    title="View Question Analysis">
                                    <SafeIcon name="Eye" size={15} />
                                  </button>
                                  <button className="btn btn-ghost btn-sm"
                                    onClick={() => setDeleteTarget(r._id)}
                                    title="Delete Result">
                                    <SafeIcon name="Trash2" size={15} color="var(--danger)" />
                                  </button>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, tableData.length)} of {tableData.length} records
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}>Previous</button>
                    <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                      {currentPage} / {totalPages}
                    </span>
                    <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}>Next</button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Exam Result"
        message="Are you sure you want to permanently delete this exam result? This will completely remove it from the Google Sheets database."
        loading={deleteLoading}
      />

      <AdminExamDetailsDrawer
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </div>
  );
}
