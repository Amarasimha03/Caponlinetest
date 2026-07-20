import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import api from '../../../services/api';
import socket from '../../../services/socket';
import useAuthStore from '../../../store/authStore';
import DashboardStats from './DashboardStats';
import { MyExamsTable, CompletedResultsTable } from './DashboardTable';

const LS_ASSESSMENTS_KEY = 'employee_assessments_cache';
const LS_ASSESSMENTS_TIMESTAMP = 'employee_assessments_timestamp';

export default function EmployeeDashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const loadAbortController = useRef(new AbortController());

  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  // Unused notifications state removed
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async (isBackground = false) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    if (!isBackground) setLoading(true);

    try {
      loadAbortController.current.abort();
      loadAbortController.current = new AbortController();

      const { data } = await api.get('/assessments/my', {
        signal: loadAbortController.current.signal,
        _isBackgroundRefresh: isBackground
      });

      const list = data.assessments || [];
      const sorted = list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      setAssessments(sorted);

    } catch (err) {
      if (err.name !== 'CanceledError' && err.message !== 'canceled') {
        console.error('[Dashboard] Load failed:', err.message);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30000);

    if (user?._id) {
      socket.emit('employee:join-room', { employeeId: user._id });
    }

    socket.on('db:sync', () => {
      console.log('📡 Real-time sync signal received — clearing cache and refreshing exam list');
      // ✅ Clear localStorage cache immediately so fresh data is always fetched, not stale cache
      localStorage.removeItem(LS_ASSESSMENTS_KEY);
      localStorage.removeItem(LS_ASSESSMENTS_TIMESTAMP);
      load(true);
    });

    return () => {
      clearInterval(interval);
      loadAbortController.current.abort();
      socket.off('db:sync');
    };
  }, [load, user?._id]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleViewResult = (exam) => {
    if (exam.result && exam.result._id) {
      navigate(`/employee/results/${exam.result._id}`);
    } else {
      toast.error('Result not found or exam not completed.');
    }
  };

  const validAssessments = Array.isArray(assessments) ? assessments : [];

  const filteredAssessments = validAssessments.filter(a =>
    a.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ✅ Normalize examCompleted — Google Sheets returns "true" (string), not true (boolean)
  const isExamCompleted = (a) =>
    a.status === 'completed' ||
    a.result?.status === 'submitted' ||
    a.result?.status === 'auto-submitted' ||
    a.result?.status === 'completed' ||
    String(a.result?.examCompleted).toLowerCase() === 'true';

  const completed = filteredAssessments.filter(isExamCompleted);
  const pending = filteredAssessments.filter(a => !isExamCompleted(a));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Navbar */}
      <nav style={{
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)',
        padding: '0 32px', height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(20px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Employee<span style={{ color: 'var(--primary)' }}>Portal</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search exams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 99, padding: '8px 16px 8px 36px', fontSize: 14, color: 'var(--text-primary)',
                width: 200, transition: 'all 0.2s', outline: 'none'
              }}
              onFocus={e => { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.borderColor = 'var(--primary)'; e.target.style.width = '240px'; }}
              onBlur={e => { e.target.style.background = 'rgba(255,255,255,0.03)'; e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.width = '200px'; }}
            />
          </div>

          {/* Notifications removed as requested */}

          <div style={{ width: 1, height: 24, background: 'var(--border-color)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>{user?.fullName || 'Employee'}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user?.department || 'Candidate'}</span>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', border: '2px solid rgba(255,255,255,0.1)' }}>
              {(user?.fullName || 'E').charAt(0).toUpperCase()}
            </div>
            <button onClick={handleLogout} className="btn" style={{
              background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)',
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer', borderRadius: 8, transition: 'all 0.2s'
            }} onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; }}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main style={{ padding: '40px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.02em' }}>
                Welcome, {user?.fullName?.split(' ')[0] || 'Employee'}! 👋
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Here's your assessment overview</p>
            </div>
          </div>

          <DashboardStats assessments={validAssessments} />

          <MyExamsTable loading={loading} assessments={pending} handleViewResult={handleViewResult} />

          <CompletedResultsTable loading={loading} completed={completed} handleViewResult={handleViewResult} />

        </motion.div>
      </main>
    </div>
  );
}
