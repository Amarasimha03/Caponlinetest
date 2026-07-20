import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Plus, Edit, Trash2, X, Clock, Award, Settings,
  Send, Users, RefreshCw, User, Building2, Tag, AlertTriangle, Shuffle
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import socket from '../../services/socket';
import { useConfig } from '../../hooks/useConfig';

// STATUS_COLORS is a pure UI constant mapping fixed status strings to CSS class names
const STATUS_COLORS = { draft: 'badge-muted', active: 'badge-success', scheduled: 'badge-warning', completed: 'badge-info' };
const defaultForm = {
  _id: undefined, title: '', description: '', duration: 30, timePerQuestion: 30,
  passingScore: 60, category: '', isRandomized: false, maxViolations: 3, status: 'draft',
  questions: [],
};

const EmployeeRow = React.memo(({ employee, isSelected, onToggle }) => {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', cursor: 'pointer', borderRadius: 6 }}>
      <input type="checkbox" checked={isSelected} onChange={() => onToggle(employee._id)} style={{ accentColor: 'var(--primary)' }} />
      <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{(employee.fullName || '?')[0]}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{employee.fullName}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{employee.email} · {employee.department}</div>
      </div>
    </label>
  );
});

const getQuestionCount = (questions) => {
  if (!questions) return 0;
  if (Array.isArray(questions)) return questions.length;
  if (typeof questions === 'string') {
    try {
      const parsed = JSON.parse(questions);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0; // fallback if invalid JSON
    }
  }
  return 0;
};

const AssessmentCard = React.memo(({ a, i, openSend, openEdit, triggerDelete, navigate }) => {
  const isSyncing = String(a._id).startsWith('temp-');
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.5) }}
      className="card" style={{ padding: 0, overflow: 'hidden', opacity: isSyncing ? 0.7 : 1 }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1, marginRight: 8 }}>{a.title}</h3>
          <span className={`badge ${STATUS_COLORS[a.status] || 'badge-muted'}`}>{isSyncing ? 'syncing...' : a.status}</span>
        </div>
        {a.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{a.description}</p>}
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          <Users size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {a.assignedTo?.length || 0} employees assigned
        </div>
      </div>

      <div style={{ padding: '14px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, rowGap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <Clock size={15} color="var(--secondary)" />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{a.duration}m</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Duration</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <FileText size={15} color="var(--primary-light)" />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{getQuestionCount(a.questions)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Questions</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Award size={15} color="var(--success)" />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{a.passingScore}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pass Score</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Tag size={15} color="var(--info)" />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>{a.category || 'General'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Category</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <AlertTriangle size={15} color="var(--warning)" />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{a.maxViolations || 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Violations</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Shuffle size={15} color={a.isRandomized ? 'var(--success)' : 'var(--text-muted)'} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>{a.isRandomized ? 'Yes' : 'No'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Randomized</div>
        </div>
      </div>

      <div style={{ padding: '12px 24px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--border-light)' }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => openSend(a)} disabled={isSyncing}>
          <Send size={14} /> {isSyncing ? 'Syncing...' : 'Send Exam'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/admin/questions/${a._id}`)} disabled={isSyncing} title={isSyncing ? 'Syncing with Google Sheets...' : 'Questions Settings'}>
          <Settings size={14} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)} disabled={isSyncing}>
          <Edit size={14} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => triggerDelete(a._id)} disabled={isSyncing}>
          <Trash2 size={14} color="var(--danger)" />
        </button>
      </div>
    </motion.div>
  );
});

export default function AdminAssessments() {
  const [assessments, setAssessments] = useState(() => {
    try {
      const cached = localStorage.getItem('admin_assessments_list');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [employees, setEmployees] = useState(() => {
    try {
      const cached = localStorage.getItem('admin_employees_list');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(() => {
    return !localStorage.getItem('admin_assessments_list');
  });
  const [showModal, setShowModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(null); // assessment to send
  const [editing, setEditing] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendTarget, setSendTarget] = useState('all'); // 'all' | 'department' | 'individual'
  const [sendDept, setSendDept] = useState('');
  const [sendEmployeeIds, setSendEmployeeIds] = useState([]);
  const navigate = useNavigate();
  const [form, setForm] = useState(defaultForm);

  // Fetch dynamic config (categories come from live DB data)
  const { config } = useConfig();
  // Derive categories: union of config defaults + any new categories in existing assessments
  const CATEGORIES = React.useMemo(() => {
    const fromAssessments = assessments.map(a => (a.category || '').trim()).filter(Boolean);
    return [...new Set([...config.categories, ...fromAssessments])].sort();
  }, [assessments, config.categories]);

  const load = async (isBackground = false) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const hasCache = assessments.length > 0;
    if (!isBackground && !hasCache) setLoading(true);
    try {
      const config = isBackground ? { _isBackgroundRefresh: true } : {};
      const [aRes, eRes] = await Promise.all([api.get('/assessments', config), api.get('/employees', config)]);
      const assessmentsList = aRes.data.assessments || [];
      const employeesList = eRes.data.employees || [];
      setAssessments(assessmentsList);
      setEmployees(employeesList);
      localStorage.setItem('admin_assessments_list', JSON.stringify(assessmentsList));
      localStorage.setItem('admin_employees_list', JSON.stringify(employeesList));
    } catch {
      if (!isBackground && !hasCache) toast.error('Failed to load data');
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
    const intervalId = setInterval(() => {
      console.log('[AdminAssessments] Polling fresh data from server...');
      load(true);
    }, 30000);

    // Live Socket sync hook
    socket.on('db:sync', () => {
      console.log('📡 Real-time sync signal received: updating assessment list');
      load(true);
    });

    return () => {
      clearInterval(intervalId);
      socket.off('db:sync');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm({ ...form, [e.target.name]: val });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const previousAssessments = [...assessments];
    const tempId = form._id && form._id.trim() !== '' ? form._id : `temp-${Date.now()}`;
    const optimisticAssessment = {
      ...defaultForm,
      ...form,
      _id: editing ? editing._id : tempId,
      questions: editing ? editing.questions : (form.questions || []),
      assignedTo: editing ? editing.assignedTo : [],
      createdAt: editing ? editing.createdAt : new Date().toISOString(),
      status: form.status || 'draft',
    };

    // Close modal & reset form immediately for an instant response!
    setShowModal(false);
    setForm(defaultForm);
    const wasEditing = editing;
    setEditing(null);

    // Apply Optimistic UI Update immediately
    if (wasEditing) {
      setAssessments(prev => prev.map(a => a._id === wasEditing._id ? optimisticAssessment : a));
    } else {
      setAssessments(prev => [optimisticAssessment, ...prev]);
    }

    setSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload._id || payload._id.trim() === '') {
        delete payload._id;
      }

      if (wasEditing) {
        const res = await api.put(`/assessments/${wasEditing._id}`, payload);
        toast.success('Assessment updated successfully');
        setAssessments(prev => {
          const updated = prev.map(a => a._id === wasEditing._id ? res.data.assessment : a);
          localStorage.setItem('admin_assessments_list', JSON.stringify(updated));
          return updated;
        });
      } else {
        const res = await api.post('/assessments', payload);
        toast.success('Assessment created successfully');
        setAssessments(prev => {
          const updated = prev.map(a => a._id === tempId ? res.data.assessment : a);
          localStorage.setItem('admin_assessments_list', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) { 
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to save assessment'); 
      // Revert Optimistic Update
      setAssessments(previousAssessments);
    } finally {
      setSubmitting(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget; // Store local copy to prevent closure issues
    
    // Instant optimistic UI update
    setDeleteLoading(true);
    const previousAssessments = [...assessments];
    setAssessments(prev => {
      const filtered = prev.filter(a => String(a._id) !== String(targetId));
      localStorage.setItem('admin_assessments_list', JSON.stringify(filtered));
      return filtered;
    });
    setDeleteTarget(null); // Hide modal instantly
    
    try {
      await api.delete(`/assessments/${targetId}`);
      toast.success('Assessment and all related records permanently deleted');
      // No load() called to prevent UI flicker
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete assessment');
      // Revert Optimistic UI Update on failure
      setAssessments(previousAssessments);
      localStorage.setItem('admin_assessments_list', JSON.stringify(previousAssessments));
    } finally {
      setDeleteLoading(false);
    }
  };

  const openEdit = useCallback((a) => {
    setEditing(a);
    setForm({
      _id: a._id,
      title: a.title, description: a.description || '', duration: a.duration,
      timePerQuestion: a.timePerQuestion, passingScore: a.passingScore,
      category: a.category, isRandomized: a.isRandomized, maxViolations: a.maxViolations, status: a.status,
    });
    setShowModal(true);
  }, []);

  const openSend = useCallback((a) => {
    setShowSendModal(a);
    setSendTarget('all');
    setSendDept('');
    setSendEmployeeIds([]);
  }, []);

  const triggerDelete = useCallback((id) => {
    setDeleteTarget(id);
  }, []);

  const toggleEmployeeSelect = useCallback((id) => {
    setSendEmployeeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))];

  const handleSendExam = async () => {
    if (!showSendModal) return;
    setSending(true);
    try {
      let targetEmployeeIds = [];
      if (sendTarget === 'all') {
        targetEmployeeIds = employees.map(e => e._id);
      } else if (sendTarget === 'department') {
        targetEmployeeIds = employees.filter(e => e.department === sendDept).map(e => e._id);
      } else {
        targetEmployeeIds = sendEmployeeIds;
      }

      if (targetEmployeeIds.length === 0) {
        toast.error('No employees selected');
        setSending(false);
        return;
      }

      // Assign exam to each employee
      await api.post(`/assessments/${showSendModal._id}/assign-bulk`, {
        employeeIds: targetEmployeeIds,
        assessmentId: showSendModal._id,
      });

      toast.success(`✅ Exam sent to ${targetEmployeeIds.length} employee(s) & synced to Google Sheets!`);
      setShowSendModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send exam');
    }
    setSending(false);
  };

  const stats = React.useMemo(() => [
    { label: 'Total', value: assessments.length, color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
    { label: 'Active', value: assessments.filter(a => a.status === 'active').length, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    { label: 'Draft', value: assessments.filter(a => a.status === 'draft').length, color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    { label: 'Completed', value: assessments.filter(a => a.status === 'completed').length, color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)' },
  ], [assessments]);

  // Skeleton Card Loader
  const SkeletonCard = () => (
    <div className="card" style={{ padding: 0, overflow: 'hidden', animation: 'pulse 1.5s infinite ease-in-out' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ height: 18, width: '60%', backgroundColor: 'var(--border-light)', borderRadius: 4, marginBottom: 12 }} />
        <div style={{ height: 12, width: '90%', backgroundColor: 'var(--border-light)', borderRadius: 4, marginBottom: 8 }} />
        <div style={{ height: 12, width: '40%', backgroundColor: 'var(--border-light)', borderRadius: 4 }} />
      </div>
      <div style={{ padding: '14px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, rowGap: 16 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ height: 24, width: 24, backgroundColor: 'var(--border-light)', borderRadius: '50%', marginBottom: 8 }} />
            <div style={{ height: 12, width: 40, backgroundColor: 'var(--border-light)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 24px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--border-light)' }}>
        <div style={{ height: 32, flex: 1, backgroundColor: 'var(--border-light)', borderRadius: 6 }} />
        <div style={{ height: 32, width: 32, backgroundColor: 'var(--border-light)', borderRadius: 6 }} />
        <div style={{ height: 32, width: 32, backgroundColor: 'var(--border-light)', borderRadius: 6 }} />
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Assessment Management</h1>
          <p>Create, manage, and assign assessments to employees</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={load} title="Refresh" disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(defaultForm); setShowModal(true); }}>
            <Plus size={18} /> Create Assessment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginTop: 24, marginBottom: 20 }}>
        {stats.map((s, i) => (
          <motion.div key={s.label} className="stat-card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <div className="stat-icon" style={{ background: s.bg }}><FileText size={22} color={s.color} /></div>
            <div className="stat-info"><h3>{s.value}</h3><p>{s.label}</p></div>
          </motion.div>
        ))}
      </div>

      {/* Assessment Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
        {loading && assessments.length === 0 ? (
          [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
        ) : (
          assessments.map((a, i) => (
            <AssessmentCard
              key={a._id || `temp-${i}`}
              a={a}
              i={i}
              openSend={openSend}
              openEdit={openEdit}
              triggerDelete={triggerDelete}
              navigate={navigate}
            />
          ))
        )}
      </div>

      {!loading && assessments.length === 0 && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <FileText size={48} />
          <h3>No assessments yet</h3>
          <p>Create your first assessment to begin</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)}>
            <motion.div className="modal" style={{ maxWidth: 560 }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">{editing ? 'Edit Assessment' : 'Create Assessment'}</h3>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Custom ID (Optional)</label>
                    <input className="form-input" name="_id" value={form._id || ''} onChange={handleChange} placeholder="e.g. AA01" disabled={!!editing} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Title *</label>
                    <input className="form-input" name="title" value={form.title} onChange={handleChange} required placeholder="e.g. JavaScript Fundamentals" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" name="description" value={form.description} onChange={handleChange} placeholder="Assessment description..." rows={3} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Duration (min)</label>
                    <input className="form-input" name="duration" type="number" value={form.duration} onChange={handleChange} min={1} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time/Question (sec)</label>
                    <input className="form-input" name="timePerQuestion" type="number" value={form.timePerQuestion} onChange={handleChange} min={5} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Pass Score (%)</label>
                    <input className="form-input" name="passingScore" type="number" value={form.passingScore} onChange={handleChange} min={0} max={100} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-input form-select" name="category" value={form.category} onChange={handleChange}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-input form-select" name="status" value={form.status} onChange={handleChange}>
                      {['draft', 'active', 'scheduled', 'completed'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Max Violations</label>
                    <input className="form-input" name="maxViolations" type="number" value={form.maxViolations} onChange={handleChange} min={1} />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: 28 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14 }}>
                      <input type="checkbox" name="isRandomized" checked={form.isRandomized} onChange={handleChange} style={{ accentColor: 'var(--primary)' }} />
                      Randomize Questions
                    </label>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Send Exam Modal */}
      <AnimatePresence>
        {showSendModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSendModal(null)}>
            <motion.div className="modal" style={{ maxWidth: 560 }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title"><Send size={18} style={{ marginRight: 8 }} />Send Exam</h3>
                <button className="modal-close" onClick={() => setShowSendModal(null)}><X size={20} /></button>
              </div>

              {/* Exam Info */}
              <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Exam</span><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{showSendModal.title}</div></div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Questions</span><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{getQuestionCount(showSendModal.questions)}</div></div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Duration</span><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{showSendModal.duration} min</div></div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Category</span><div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{showSendModal.category}</div></div>
              </div>

              {/* Target Selection */}
              <div className="form-group">
                <label className="form-label">Send To</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { value: 'all', label: 'All Employees', icon: <Users size={16} /> },
                    { value: 'department', label: 'By Department', icon: <Building2 size={16} /> },
                    { value: 'individual', label: 'Select Employees', icon: <User size={16} /> },
                  ].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setSendTarget(opt.value)}
                      style={{
                        padding: '10px 8px', borderRadius: 8, border: `2px solid ${sendTarget === opt.value ? 'var(--primary)' : 'var(--border-light)'}`,
                        background: sendTarget === opt.value ? 'rgba(99,102,241,0.12)' : 'transparent',
                        color: sendTarget === opt.value ? 'var(--primary)' : 'var(--text-muted)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      }}>
                      {opt.icon}{opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Department Picker */}
              {sendTarget === 'department' && (
                <div className="form-group">
                  <label className="form-label">Select Department</label>
                  <select className="form-input form-select" value={sendDept} onChange={e => setSendDept(e.target.value)}>
                    <option value="">— Choose Department —</option>
                    {departments.map(d => <option key={d}>{d}</option>)}
                  </select>
                  {sendDept && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    {employees.filter(e => e.department === sendDept).length} employee(s) in {sendDept}
                  </p>}
                </div>
              )}

              {/* Individual Employee Picker */}
              {sendTarget === 'individual' && (
                <div className="form-group">
                  <label className="form-label">Select Employees ({sendEmployeeIds.length} selected)</label>
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 8, padding: 8 }}>
                    {employees.length === 0
                      ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 12, fontSize: 13 }}>No employees found</p>
                      : employees.map(e => (
                        <EmployeeRow
                          key={e._id}
                          employee={e}
                          isSelected={sendEmployeeIds.includes(e._id)}
                          onToggle={toggleEmployeeSelect}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div style={{ background: 'rgba(16,185,129,0.07)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                ✅ Exam assignment will be logged in <strong>Google Sheets</strong> with all employee details.
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowSendModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSendExam} disabled={sending}>
                  <Send size={16} /> {sending ? 'Sending...' : 'Send Exam'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Assessment"
        message="Are you sure you want to permanently delete this assessment? This will completely remove the assessment, all its MCQs/questions, result logs, and violation histories from Google Sheets."
        loading={deleteLoading}
      />
    </div>
  );
}
