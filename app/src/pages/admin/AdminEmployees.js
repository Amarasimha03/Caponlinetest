import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Search, Edit, Trash2, X, BookOpen, Eye, Filter, RefreshCw, Upload, Download, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import socket from '../../services/socket';
import { useConfig } from '../../hooks/useConfig';

// ROLES is a true domain constant (only 2 possible values, fixed by auth system)
const ROLES = ['employee', 'admin'];
// File extensions for Excel upload validation — a format constant, not data
const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

const defaultForm = { fullName: '', employeeId: '', email: '', phone: '', department: '', designation: '', designationCustom: '', company: '', companyCustom: '', role: 'employee', password: '', status: 'Active' };

export default function AdminEmployees() {
  const [employees, setEmployees] = useState(() => {
    try {
      const cached = localStorage.getItem('admin_employees_list');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(() => {
    return !localStorage.getItem('admin_employees_list');
  });
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showAssign, setShowAssign] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  // Excel Upload States
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [uploadErrors, setUploadErrors] = useState([]);
  const fileInputRef = useRef(null);

  // Drag & drop state
  const [dragActive, setDragActive] = useState(false);

  // Fetch dynamic config (departments, designations, companies) from API
  const { config } = useConfig();
  const DEPARTMENTS = config.departments;
  const DESIGNATIONS = config.designations;
  const COMPANIES = config.companies;

  const downloadSampleTemplate = () => {
    const headers = 'Employee ID,Employee Name,Email,Phone Number,Department,Role,Password,Status\n';
    const sampleRows = [
      'EMP-88899,John Doe,john.doe@company.com,+91 9999988888,Engineering,employee,John@Pass123,Active',
      'EMP-88898,Jane Smith,jane.smith@company.com,+91 9999988887,HR,employee,Jane@Pass123,Active'
    ].join('\n');

    const blob = new Blob([headers + sampleRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_import_template.csv';
    a.click();
  };

  const handleExcelUpload = async (file) => {
    if (!file) return;

    // Type validation (EXCEL_EXTENSIONS is defined at module level)
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!EXCEL_EXTENSIONS.includes(fileExt)) {
      toast.error('Invalid Excel format. Please upload .xlsx, .xls or .csv only.');
      return;
    }

    // Size validation: 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File exceeds 10MB size limit.');
      return;
    }

    setUploading(true);
    setUploadSummary(null);
    setUploadErrors([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post('/employees/upload-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (data.success) {
        setUploadSummary(data.summary);
        setUploadErrors(data.errors || []);
        toast.success('Excel processing completed!');
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to process Excel upload');
    }
    setUploading(false);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleExcelUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleExcelUpload(e.target.files[0]);
    }
  };

  // Export all employees to CSV function
  const handleExportCSV = () => {
    const headers = 'Employee ID,Employee Name,Email,Phone,Department,Role,Status,Assigned Exams\n';
    const rows = employees.map(emp => 
      `"${emp.employeeId}","${emp.fullName}","${emp.email}","${emp.phone || '—'}","${emp.department || 'General'}","${emp.role || 'employee'}","${emp.isActive ? 'Active' : 'Inactive'}",${emp.assignedAssessments?.length || 0}`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees_list_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast.success('Employee list exported successfully');
  };

  const load = async (isBackground = false) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const hasCache = employees.length > 0;
    if (!isBackground && !hasCache) setLoading(true);
    try {
      const config = isBackground ? { _isBackgroundRefresh: true } : {};
      const { data } = await api.get('/employees', config);
      const employeesWithStatus = (data.employees || []).map(e => ({
        ...e,
        isActive: e.status === 'Active' || e.isActive, // derive isActive from status if needed
      }));
      setEmployees(employeesWithStatus);
      localStorage.setItem('admin_employees_list', JSON.stringify(employeesWithStatus));
    } catch {
      if (!isBackground && !hasCache) toast.error('Failed to load employees');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const intervalId = setInterval(() => {
      console.log('[AdminEmployees] Polling fresh data from server...');
      load(true);
    }, 30000);

    // Live Socket sync hook
    socket.on('db:sync', () => {
      console.log('📡 Real-time sync signal received: updating employee list');
      load(true);
    });

    return () => {
      clearInterval(intervalId);
      socket.off('db:sync');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Resolve "Other" dropdown values to custom text
      const payload = {
        ...form,
        designation: form.designation === 'Other' ? form.designationCustom : form.designation,
        company: form.company === 'Other' ? form.companyCustom : form.company,
      };
      delete payload.designationCustom;
      delete payload.companyCustom;

      if (editing) {
        await api.put(`/employees/${editing._id}`, payload);
        toast.success('Employee updated successfully');
      } else {
        await api.post('/employees', payload);
        toast.success('Employee created & synced to Google Sheets!');
      }
      setShowModal(false); setEditing(null);
      setForm(defaultForm);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Operation failed'); }
    setSubmitting(false);
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const triggerDelete = (id) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const prevEmployees = [...employees];
    // Optimistic UI update
    setEmployees(employees.filter(e => e._id !== deleteTarget));
    try {
      await api.delete(`/admin/employees/${deleteTarget}`);
      toast.success('Employee permanently deleted');
      setDeleteTarget(null);
      // load(); // No need to load immediately as optimistic update covers it
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete employee');
      setEmployees(prevEmployees); // Revert on failure
    }
    setDeleteLoading(false);
  };

  const openEdit = (emp) => {
    setEditing(emp);
    const desigInList = DESIGNATIONS.includes(emp.designation);
    const compInList = COMPANIES.includes(emp.company);
    setForm({
      fullName: emp.fullName || '',
      employeeId: emp.employeeId || '',
      email: emp.email || '',
      phone: emp.phone || '',
      department: emp.department || DEPARTMENTS[0] || '',
      designation: desigInList ? emp.designation : 'Other',
      designationCustom: desigInList ? '' : (emp.designation || ''),
      company: compInList ? emp.company : 'Other',
      companyCustom: compInList ? '' : (emp.company || ''),
      role: emp.role || 'employee',
      password: '',
      status: emp.isActive ? 'Active' : 'Inactive',
    });
    setShowModal(true);
  };

  const openAssign = async (emp) => {
    setShowAssign(emp);
    try { const { data } = await api.get('/assessments'); setAssessments(data.assessments); }
    catch { toast.error('Failed to load assessments'); }
  };

  const assignAssessment = async (assessmentId) => {
    try {
      await api.post(`/employees/${showAssign._id}/assign`, { assessmentId });
      toast.success('Assessment assigned successfully!');
      setShowAssign(null); load();
    } catch { toast.error('Failed to assign'); }
  };

  const filtered = useMemo(() => {
    return employees.filter(e => {
      const matchSearch = (e.fullName || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.email || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.employeeId || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.department || '').toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === 'All' || e.department === deptFilter;
      return matchSearch && matchDept;
    });
  }, [employees, search, deptFilter]);

  const statCards = useMemo(() => [
    { label: 'Total Employees', value: employees.length, color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
    { label: 'Active', value: employees.filter(e => e.isActive).length, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    { label: 'Inactive', value: employees.filter(e => !e.isActive).length, color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    { label: 'Departments', value: [...new Set(employees.map(e => e.department).filter(Boolean))].length, color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)' },
  ], [employees]);

  const SkeletonRow = () => (
    <tr style={{ animation: 'pulse 1.5s infinite ease-in-out' }}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--border-light)' }} />
          <div>
            <div style={{ height: 16, width: 120, backgroundColor: 'var(--border-light)', borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 12, width: 180, backgroundColor: 'var(--border-light)', borderRadius: 4 }} />
          </div>
        </div>
      </td>
      <td><div style={{ height: 14, width: 80, backgroundColor: 'var(--border-light)', borderRadius: 4 }} /></td>
      <td><div style={{ height: 24, width: 80, backgroundColor: 'var(--border-light)', borderRadius: 12 }} /></td>
      <td><div style={{ height: 14, width: 100, backgroundColor: 'var(--border-light)', borderRadius: 4 }} /></td>
      <td><div style={{ height: 24, width: 70, backgroundColor: 'var(--border-light)', borderRadius: 12 }} /></td>
      <td><div style={{ height: 24, width: 40, backgroundColor: 'var(--border-light)', borderRadius: 12 }} /></td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ height: 28, width: 28, backgroundColor: 'var(--border-light)', borderRadius: 6 }} />)}
        </div>
      </td>
    </tr>
  );

  return (
    <div>
      {/* Header */}
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Employee Management</h1>
          <p>Manage employees and assign assessments</p>
        </div>
        <div className="page-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
          <button className="btn btn-secondary" onClick={load} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button className="btn btn-secondary" onClick={handleExportCSV} title="Export Employees List">
            <Download size={16} /> Export CSV
          </button>
          <button className="btn btn-secondary" onClick={() => setShowUploadModal(true)} title="Upload Excel Sheet">
            <Upload size={16} /> Upload Excel
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(defaultForm); setShowModal(true); }}>
            <Plus size={18} /> Add Employee
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginTop: 24, marginBottom: 20 }}>
        {statCards.map((s, i) => (
          <motion.div key={s.label} className="stat-card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <div className="stat-icon" style={{ background: s.bg }}>
              <Users size={22} color={s.color} />
            </div>
            <div className="stat-info"><h3>{s.value}</h3><p>{s.label}</p></div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="form-input" placeholder="Search by name, email, ID, department..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 38, marginBottom: 0 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Filter size={15} color="var(--text-muted)" />
          <select className="form-input form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ marginBottom: 0, minWidth: 140 }}>
            <option value="All">All Departments</option>
            {/* Derive filter options from actual loaded data for 100% accuracy */}
            {[...new Set(employees.map(e => e.department).filter(Boolean))].sort().map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Employee ID</th>
                <th>Department</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Assessments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && employees.length === 0 ? (
                [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
              ) : (
                filtered.map((emp, i) => (
                  <motion.tr key={`${emp._id}-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="avatar">{(emp.fullName || '?')[0].toUpperCase()}</div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{emp.fullName}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {emp.employeeId || emp._id?.slice(-8).toUpperCase()}
                    </td>
                    <td><span className="badge badge-primary">{emp.department || '—'}</span></td>
                    <td style={{ fontSize: 13 }}>{emp.phone || '—'}</td>
                    <td>
                      <span className={`badge ${emp.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>
                        {emp.role || 'employee'}
                      </span>
                    </td>
                    <td><span className="badge badge-info">{emp.assignedAssessments?.length || 0}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowViewModal(emp)} title="View Profile">
                          <Eye size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openAssign(emp)} title="Assign Assessment">
                          <BookOpen size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(emp)} title="Edit">
                          <Edit size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => triggerDelete(emp._id)} title="Delete">
                          <Trash2 size={14} color="var(--danger)" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <Users size={48} />
            <h3>No employees found</h3>
            <p>{search || deptFilter !== 'All' ? 'Try adjusting your filters' : 'Add your first employee to get started'}</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)}>
            <motion.div className="modal" style={{ maxWidth: 580 }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">{editing ? 'Edit Employee' : '➕ Add Employee'}</h3>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Full Name *</label>
                    <input className="form-input" name="fullName" value={form.fullName} onChange={handleChange} required placeholder="Enter full name" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Employee ID</label>
                    <input className="form-input" name="employeeId" value={form.employeeId} onChange={handleChange} placeholder="e.g. EMP-001 (auto if blank)" />
                  </div>
                  {!editing && (
                    <div className="form-group">
                      <label className="form-label">Email Address *</label>
                      <input className="form-input" name="email" type="email" value={form.email} onChange={handleChange} required placeholder="employee@email.com" />
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Phone Number *</label>
                    <input className="form-input" name="phone" value={form.phone} onChange={handleChange} required placeholder="+91 XXXXXXXXXX" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select className="form-input form-select" name="department" value={form.department} onChange={handleChange}>
                      {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Designation</label>
                    <select className="form-input form-select" name="designation" value={form.designation} onChange={handleChange}>
                      {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      <option value="Other">✏️ Other (type manually)</option>
                    </select>
                    {form.designation === 'Other' && (
                      <input
                        className="form-input"
                        name="designationCustom"
                        value={form.designationCustom}
                        onChange={handleChange}
                        placeholder="Enter designation"
                        style={{ marginTop: 8 }}
                        required
                      />
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Company Name</label>
                    <select className="form-input form-select" name="company" value={form.company} onChange={handleChange}>
                      {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="Other">✏️ Other (type manually)</option>
                    </select>
                    {form.company === 'Other' && (
                      <input
                        className="form-input"
                        name="companyCustom"
                        value={form.companyCustom}
                        onChange={handleChange}
                        placeholder="Enter company name"
                        style={{ marginTop: 8 }}
                        required
                      />
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select className="form-input form-select" name="role" value={form.role} onChange={handleChange}>
                      {ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-input form-select"
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      style={{
                        color: form.status === 'Active' ? '#10b981' : '#f59e0b',
                        fontWeight: 600,
                      }}
                    >
                      <option value="Active">🟢 Active</option>
                      <option value="Inactive">🟡 Inactive</option>
                    </select>
                  </div>
                  {!editing && (
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label className="form-label">Password * (min 6 chars)</label>
                      <input className="form-input" name="password" type="password" value={form.password} onChange={handleChange} required minLength={6} placeholder="Set login password" />
                    </div>
                  )}
                </div>
                <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: 8, padding: '10px 14px', marginTop: 8, marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                  ✅ Employee data will be automatically saved to <strong>Google Sheets</strong> upon creation.
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Saving...' : editing ? 'Update Employee' : 'Save Employee'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Employee Modal */}
      <AnimatePresence>
        {showViewModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowViewModal(null)}>
            <motion.div className="modal" style={{ maxWidth: 480 }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Employee Profile</h3>
                <button className="modal-close" onClick={() => setShowViewModal(null)}><X size={20} /></button>
              </div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div className="avatar" style={{ width: 64, height: 64, fontSize: 28, margin: '0 auto 12px' }}>
                  {(showViewModal.fullName || '?')[0].toUpperCase()}
                </div>
                <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>{showViewModal.fullName}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{showViewModal.email}</div>
              </div>
              {[
                ['Employee ID', showViewModal.employeeId || showViewModal._id?.slice(-8).toUpperCase()],
                ['Phone', showViewModal.phone || '—'],
                ['Department', showViewModal.department || '—'],
                ['Role', showViewModal.role || 'employee'],
                ['Assessments Assigned', showViewModal.assignedAssessments?.length || 0],
                ['Created', showViewModal.createdAt ? new Date(showViewModal.createdAt).toLocaleDateString() : '—'],
                ['Last Login', showViewModal.lastLogin ? new Date(showViewModal.lastLogin).toLocaleString() : 'Never'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
              <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowViewModal(null)}>Close</button>
                <button className="btn btn-primary" onClick={() => { setShowViewModal(null); openEdit(showViewModal); }}>Edit</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assign Assessment Modal */}
      <AnimatePresence>
        {showAssign && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAssign(null)}>
            <motion.div className="modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Assign Assessment – {showAssign.fullName}</h3>
                <button className="modal-close" onClick={() => setShowAssign(null)}><X size={20} /></button>
              </div>
              {assessments.length > 0 ? assessments.map(a => (
                <div key={a._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.duration}min • {a.questions?.length || 0} questions • {a.category}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => assignAssessment(a._id)}>Assign</button>
                </div>
              )) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No assessments available. Create one first.</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Excel Sheet Upload Modal (Drag and Drop) */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowUploadModal(false)}>
            <motion.div className="modal" style={{ maxWidth: 620 }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">📤 Bulk Import Employees via Excel/CSV</h3>
                <button className="modal-close" onClick={() => setShowUploadModal(false)}><X size={20} /></button>
              </div>

              {/* Drag and Drop Box */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border)'}`,
                  background: dragActive ? 'rgba(99,102,241,0.05)' : 'var(--bg-secondary)',
                  borderRadius: 12,
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s',
                  marginBottom: 20
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  style={{ display: 'none' }} 
                  onChange={handleFileChange}
                />
                
                {uploading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <Loader2 size={36} className="animate-spin text-primary-light" />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Parsing spreadsheet data...</span>
                  </div>
                ) : (
                  <div>
                    <Upload size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                    <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>
                      Drag and drop your spreadsheet here
                    </h4>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                      Supports .xlsx, .xls and .csv file formats
                    </p>
                    <button className="btn btn-secondary btn-sm" style={{ pointerEvents: 'none' }}>
                      Browse Files
                    </button>
                  </div>
                )}
              </div>

              {/* Summary Stats after Upload */}
              {uploadSummary && (
                <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>Import Summary:</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, textAlign: 'center' }}>
                    <div style={{ padding: 8, background: 'var(--bg-card)', borderRadius: 6 }}><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary-light)' }}>{uploadSummary.total}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total</div></div>
                    <div style={{ padding: 8, background: 'var(--bg-card)', borderRadius: 6 }}><div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{uploadSummary.success}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Success</div></div>
                    <div style={{ padding: 8, background: 'var(--bg-card)', borderRadius: 6 }}><div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>{uploadSummary.failed}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Failed</div></div>
                    <div style={{ padding: 8, background: 'var(--bg-card)', borderRadius: 6 }}><div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>{uploadSummary.duplicates}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Duplicates</div></div>
                  </div>
                </div>
              )}

              {/* Error logs/issues logs */}
              {uploadErrors.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: 18, marginBottom: 20, maxHeight: 180, overflowY: 'auto' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={15} /> Processing Alerts/Errors ({uploadErrors.length}):
                  </h4>
                  <ul style={{ paddingLeft: 16, margin: 0, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {uploadErrors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              {/* Template / Guidelines Panel */}
              <div style={{ background: 'rgba(99,102,241,0.06)', borderLeft: '4px solid var(--primary)', borderRadius: '0 8px 8px 0', padding: 14, fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>💡 Import Guidelines:</div>
                <div style={{ lineHeight: 1.4, marginBottom: 12 }}>
                  Excel headers should include: <strong>Employee ID</strong>, <strong>Employee Name</strong>, <strong>Email</strong>, <strong>Phone Number</strong>, <strong>Department</strong>, <strong>Role</strong>, <strong>Password</strong>, <strong>Status</strong>.
                  <br />Email and Employee Name are mandatory. IDs & passwords will be auto-generated if blank.
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={downloadSampleTemplate} style={{ gap: 6 }}>
                  <Download size={14} /> Download Sample CSV Template
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={() => { setShowUploadModal(false); setUploadSummary(null); setUploadErrors([]); }}>
                  Done
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
        title="Delete Employee"
        message="Are you sure you want to permanently delete this employee? This will completely remove them and all their result history from the database and Google Sheets."
        loading={deleteLoading}
      />
    </div>
  );
}
