import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import api from '../../services/api';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import AdminExamDetailsDrawer from '../../components/AdminExamDetailsDrawer';
import toast from 'react-hot-toast';
import socket from '../../services/socket';

// ─── Safely resolve icons ──────────────────────────────────────────────────────
const SafeIcon = ({ name, ...props }) => {
  const Icon = LucideIcons[name];
  return Icon ? <Icon {...props} /> : null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const COMPLETED_STATUSES = ['submitted', 'auto-submitted', 'completed', 'graded'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isPassed = (r) => String(r.passed).toLowerCase() === 'true';

const getPct = (r) => {
  const pct = parseFloat(r.percentage);
  if (!isNaN(pct) && pct > 0) return Math.round(pct);
  const marks = parseFloat(r.totalMarks);
  const score = parseFloat(r.totalScore);
  if (marks > 0 && score != null) return Math.round((score / marks) * 100);
  return 0;
};

const fmtDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtTime = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatLocal = (d) => {
  const offset = d.getTimezoneOffset();
  const localD = new Date(d.getTime() - offset * 60 * 1000);
  return localD.toISOString().split('T')[0];
};

const todayStr = formatLocal(new Date());

// ─── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function AdminResults() {
  const navigate = useNavigate();

  // ─── Unified filter state ────────────────────────────────────────────────
  const [filterParams, setFilterParams] = useState({
    from: todayStr,
    to: todayStr,
    status: '',           // '' | 'PASS' | 'FAIL'
    assessment: '',       // assessment _id or ''
    search: '',
    page: 1,
    limit: 20,
    sortPct: '',          // '' | 'desc' | 'asc'
  });
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [quickFilter, setQuickFilter] = useState('today');

  // ─── Response state ─────────────────────────────────────────────────────
  const [summary, setSummary] = useState({ publishedExams: 0, todayCompleted: 0, completed: 0, passed: 0, failed: 0, averageScore: 0 });
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);

  // ─── Other state ─────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [activeCard, setActiveCard] = useState(null);

  // Keep assessments list for dropdown (fetched once)
  const assessmentsFetched = useRef(false);
  useEffect(() => {
    if (assessmentsFetched.current) return;
    assessmentsFetched.current = true;
    api.get('/assessments').then(res => {
      setAssessments(res.data?.assessments || res.data || []);
    }).catch(() => { });
  }, []);

  // Sync debounced search into filterParams
  useEffect(() => {
    setFilterParams(prev => ({ ...prev, search: debouncedSearch, page: 1 }));
  }, [debouncedSearch]);

  // ─── Load data from /api/admin/reports ───────────────────────────────────
  const load = useCallback(async (params) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        from: params.from,
        to: params.to,
        ...(params.status && { status: params.status }),
        ...(params.assessment && { assessment: params.assessment }),
        ...(params.search && { search: params.search }),
        ...(params.sortPct && { sortPct: params.sortPct }),
        page: params.page,
        limit: params.limit,
      }).toString();

      const res = await api.get(`/admin/reports?${qs}`);
      setSummary(res.data.summary || {});
      setRecords(res.data.records || []);
      setTotalRecords(res.data.totalRecords || 0);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      toast.error('Failed to load reports');
    }
    setLoading(false);
  }, []);

  // Trigger load whenever filterParams changes
  useEffect(() => {
    load(filterParams);
  }, [filterParams, load]);

  // Socket sync
  useEffect(() => {
    const refresh = () => load(filterParams);
    socket.on('db:sync', refresh);
    return () => socket.off('db:sync', refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterParams]);

  // ─── Quick filter handler ─────────────────────────────────────────────────
  const handleQuickFilter = (preset) => {
    setQuickFilter(preset);
    if (preset === 'custom') return;
    const today = new Date();
    let fDate = new Date();
    let tDate = new Date();
    switch (preset) {
      case 'today': break;
      case 'yesterday':
        fDate.setDate(today.getDate() - 1);
        tDate.setDate(today.getDate() - 1);
        break;
      case 'last7': fDate.setDate(today.getDate() - 7); break;
      case 'last30': fDate.setDate(today.getDate() - 30); break;
      case 'thisMonth':
        fDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'lastMonth':
        fDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        tDate = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      default: break;
    }
    setFilterParams(prev => ({ ...prev, from: formatLocal(fDate), to: formatLocal(tDate), page: 1 }));
  };

  // ─── Card click handler ───────────────────────────────────────────────────
  const handleCardClick = (key) => {
    if (key === 'avgscore') {
      setFilterParams(fp => {
        let nextSort = 'desc';
        if (fp.sortPct === 'desc') nextSort = 'asc';
        else if (fp.sortPct === 'asc') nextSort = '';
        
        if (nextSort) {
          setActiveCard('avgscore');
        } else {
          setActiveCard(fp.status === 'PASS' ? 'passed' : fp.status === 'FAIL' ? 'failed' : null);
        }
        
        return { ...fp, sortPct: nextSort, page: 1 };
      });
      return;
    }

    setActiveCard(prev => {
      const next = prev === key ? null : key;
      let status = '';
      if (next === 'passed') status = 'PASS';
      if (next === 'failed') status = 'FAIL';
      setFilterParams(fp => ({ ...fp, status, sortPct: '', page: 1 }));
      return next;
    });
  };

  // ─── Delete handler ────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/results/${deleteTarget}`);
      toast.success('Result permanently deleted');
      setRecords(prev => prev.filter(r => r._id !== deleteTarget));
      setTotalRecords(prev => Math.max(0, prev - 1));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete result');
    }
    setDeleteLoading(false);
  };

  // ─── CSV Export ───────────────────────────────────────────────────────────
  const exportCSV = () => {
    const qs = new URLSearchParams({
      from: filterParams.from,
      to: filterParams.to,
      ...(filterParams.status && { status: filterParams.status }),
      ...(filterParams.assessment && { assessment: filterParams.assessment }),
      ...(filterParams.search && { search: filterParams.search }),
      ...(filterParams.sortPct && { sortPct: filterParams.sortPct }),
    }).toString();
    // Use base URL from env or fallback
    const base = process.env.REACT_APP_API_BASE_URL || window.location.origin;
    window.open(`${base}/api/admin/reports/export?${qs}`, '_blank');
  };

  // ─── Dynamic period label for the Completed card ──────────────────────────
  const periodLabel = quickFilter === 'today'     ? "Today's Completed"
                    : quickFilter === 'yesterday'  ? "Yesterday's Completed"
                    : quickFilter === 'last7'      ? 'Last 7 Days Completed'
                    : quickFilter === 'last30'     ? 'Last 30 Days Completed'
                    : quickFilter === 'thisMonth'  ? 'This Month Completed'
                    : quickFilter === 'lastMonth'  ? 'Last Month Completed'
                    : 'Period Completed';

  // ─── Cards definition ─────────────────────────────────────────────────────
  const cards = [
    { key: 'allRecords',     iconName: 'Database',       label: 'All Records',     value: summary.completed ?? 0,                color: '#8b5cf6', glow: '#8b5cf630', clickable: true  },
    { key: 'todayCompleted', iconName: 'CalendarCheck', label: periodLabel,        value: summary.todayCompleted ?? 0,           color: '#06b6d4', glow: '#06b6d430', clickable: true  },
    { key: 'passed',         iconName: 'Trophy',         label: 'Passed',          value: summary.passed         ?? 0,           color: '#10b981', glow: '#10b98130', clickable: true  },
    { key: 'failed',         iconName: 'XCircle',        label: 'Failed',          value: summary.failed         ?? 0,           color: '#ef4444', glow: '#ef444430', clickable: true  },
    { key: 'avgscore',       iconName: 'TrendingUp',     label: 'Avg Score',       value: `${summary.averageScore ?? 0}%`,       color: '#6366f1', glow: '#6366f130', clickable: true  },
  ];

  let activeLabel = activeCard === 'todayCompleted' ? periodLabel
    : activeCard === 'passed' ? 'Passed only'
    : activeCard === 'failed' ? 'Failed only'
    : activeCard === 'allRecords' ? 'All Records'
    : null;

  if (filterParams.sortPct) {
    const sortText = `Sorted by % (${filterParams.sortPct === 'desc' ? 'Highest first' : 'Lowest first'})`;
    activeLabel = activeLabel ? `${activeLabel} · ${sortText}` : sortText;
  }

  const SkeletonRow = () => (
    <tr style={{ animation: 'pulse 1.5s infinite ease-in-out' }}>
      {[40, 170, 140, 130, 70, 90, 70, 80, 90, 70].map((w, idx) => (
        <td key={idx}><div style={{ height: 14, width: w, backgroundColor: 'var(--border-light)', borderRadius: 4 }} /></td>
      ))}
    </tr>
  );

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Reports &amp; Analytics</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SafeIcon name="CheckCircle2" size={14} color="#10b981" />
            Live data reflecting latest submissions
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '6px 10px', height: 38 }}
            value={quickFilter}
            onChange={e => handleQuickFilter(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="custom">Custom Range</option>
          </select>

          <input
            type="date"
            className="form-input"
            style={{ width: 140, padding: '6px 10px', height: 38 }}
            value={filterParams.from}
            onChange={e => { setFilterParams(p => ({ ...p, from: e.target.value, page: 1 })); setQuickFilter('custom'); }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>to</span>
          <input
            type="date"
            className="form-input"
            style={{ width: 140, padding: '6px 10px', height: 38 }}
            value={filterParams.to}
            onChange={e => { setFilterParams(p => ({ ...p, to: e.target.value, page: 1 })); setQuickFilter('custom'); }}
          />

          {activeCard && (
            <button className="btn btn-ghost btn-sm" onClick={() => handleCardClick(activeCard)}>
              <SafeIcon name="XCircle" size={14} /> Clear Filter
            </button>
          )}
          <button className="btn btn-secondary" onClick={exportCSV} style={{ height: 38 }}>
            <SafeIcon name="Download" size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Dashboard Cards ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginTop: 20 }}
      >
        {cards.map(({ key, iconName, label, value, color, glow, clickable }) => {
          const isActive = activeCard === key;
          return (
            <motion.div
              key={key}
              whileHover={{ scale: clickable ? 1.02 : 1, y: clickable ? -2 : 0 }}
              whileTap={{ scale: clickable ? 0.98 : 1 }}
              onClick={() => clickable && handleCardClick(key)}
              title={clickable ? (isActive ? `Clear "${label}" filter` : `Filter by: ${label}`) : label}
              style={{
                padding: '16px 18px',
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: clickable ? 'pointer' : 'default',
                borderRadius: 14,
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
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: isActive ? `${color}25` : 'rgba(255, 255, 255, 0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isActive ? `0 0 12px ${color}40` : 'none',
                transition: 'all 0.2s ease'
              }}>
                <SafeIcon name={iconName} size={18} color={isActive ? color : 'var(--text-muted)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 22, fontWeight: 800, lineHeight: 1.1,
                  color: isActive ? color : 'var(--text-primary)',
                  transition: 'color 0.2s ease'
                }}>
                  {loading ? <span style={{ opacity: 0.4 }}>…</span> : value}
                </div>
                <div style={{
                  fontSize: 11, marginTop: 3,
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? color : 'var(--text-muted)',
                  transition: 'all 0.2s ease', whiteSpace: 'nowrap'
                }}>
                  {label}{isActive ? ' ✓' : ''}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Search & Assessment Filter ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 350 }}>
          <SafeIcon name="Search" size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            style={{ paddingLeft: 36, marginBottom: 0 }}
            placeholder="Search candidate name, email, employee ID…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <select
          className="form-input form-select"
          value={filterParams.assessment}
          onChange={e => setFilterParams(p => ({ ...p, assessment: e.target.value, page: 1 }))}
          style={{ width: 200, marginBottom: 0 }}
        >
          <option value="">All Assessments</option>
          {assessments.map(a => <option key={a._id} value={a._id}>{a.title}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          <SafeIcon name="Filter" size={13} />
          {totalRecords} record{totalRecords !== 1 ? 's' : ''}
          {activeLabel && <span style={{ color: 'var(--primary)', fontWeight: 600 }}> · {activeLabel}</span>}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 18, padding: 0, overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {!loading && records.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ padding: '80px 20px', textAlign: 'center' }}
            >
              <SafeIcon name="CalendarX" size={48} style={{ color: 'var(--border)', marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                No assessments found for the selected date range
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
                {activeCard
                  ? 'No records match the selected card filter. Click the card again to clear it.'
                  : filterParams.search || filterParams.assessment
                    ? 'No records match your search or assessment filter.'
                    : `No exams were published between ${filterParams.from} and ${filterParams.to}.`}
              </p>
              {activeCard && (
                <button className="btn btn-secondary" style={{ marginTop: 20 }} onClick={() => handleCardClick(activeCard)}>
                  <SafeIcon name="XCircle" size={14} /> Clear Filter
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="table-container table-results">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>#</th>
                      <th>Candidate Name</th>
                      <th>Email</th>
                      <th>Exam Name</th>
                      <th>Published</th>
                      <th>Status</th>
                      <th>
                        Percentage&nbsp;(%)
                        {filterParams.sortPct === 'desc' && <SafeIcon name="ArrowDown" size={12} style={{ display: 'inline', marginLeft: 4 }} />}
                        {filterParams.sortPct === 'asc' && <SafeIcon name="ArrowUp" size={12} style={{ display: 'inline', marginLeft: 4 }} />}
                      </th>
                      <th>Score</th>
                      <th>Correct&nbsp;/&nbsp;Wrong</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && records.length === 0
                      ? [...Array(6)].map((_, i) => <React.Fragment key={i}>{SkeletonRow()}</React.Fragment>)
                      : records.map((r, i) => {
                        const globalRank = (filterParams.page - 1) * filterParams.limit + i;
                        const emp = r.employee || {};
                        const ass = r.assessment || {};
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
                                {(activeCard === 'passed') && globalRank < 3 && (
                                  <SafeIcon name="Trophy" size={11} color={['#fbbf24', '#94a3b8', '#cd7f32'][globalRank]} />
                                )}
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{globalRank + 1}</span>
                              </div>
                            </td>

                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className="avatar" style={{ width: 32, height: 32, fontSize: 12, flexShrink: 0 }}>
                                  {(emp.fullName || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                  <div
                                    onClick={() => emp._id && setSelectedUserId(emp._id)}
                                    style={{
                                      fontWeight: 600, fontSize: 13,
                                      color: emp._id ? 'var(--primary)' : 'var(--text-muted)',
                                      cursor: emp._id ? 'pointer' : 'default',
                                      textDecoration: emp._id ? 'underline' : 'none'
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
                              {ass.title || '—'}
                            </td>

                            <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {fmtDate(ass.createdAt)}
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
                                {fmtDate(r.submittedAt)}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {fmtTime(r.submittedAt)}
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Showing {(filterParams.page - 1) * filterParams.limit + 1}–{Math.min(filterParams.page * filterParams.limit, totalRecords)} of {totalRecords} records
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm"
                      disabled={filterParams.page === 1}
                      onClick={() => setFilterParams(p => ({ ...p, page: p.page - 1 }))}>
                      Previous
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                      {filterParams.page} / {totalPages}
                    </span>
                    <button className="btn btn-secondary btn-sm"
                      disabled={filterParams.page === totalPages}
                      onClick={() => setFilterParams(p => ({ ...p, page: p.page + 1 }))}>
                      Next
                    </button>
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
