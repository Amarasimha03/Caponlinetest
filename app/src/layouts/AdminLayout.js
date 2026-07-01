import React, { useState, useRef, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, FileText, AlertTriangle, BarChart3,
  Monitor, LogOut, Menu, X, ChevronRight
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import useMonitoringStore from '../store/monitoringStore';
import socket from '../services/socket';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { path: '/admin/employees', icon: Users, label: 'Employees' },
  { path: '/admin/assessments', icon: FileText, label: 'Assessments' },
  { path: '/admin/results', icon: BarChart3, label: 'Reports' },
  { path: '/admin/violations', icon: AlertTriangle, label: 'Violations' },
  { path: '/admin/monitoring', icon: Monitor, label: 'Live Monitor' },
];

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const { init, fetchMonitoringData, destroy } = useMonitoringStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Stable ref so the interval callback never captures a stale/recreated function
  const fetchRef = useRef(fetchMonitoringData);
  useEffect(() => { fetchRef.current = fetchMonitoringData; });

  // Stable interval callback that always calls the latest fetch fn
  const stableFetch = useCallback(() => fetchRef.current(), []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[AdminLayout] No token — skipping socket connect');
      return;
    }

    // Connect socket only when token is confirmed present
    if (!socket.connected) {
      socket.connect();
    }

    init();
    stableFetch();
    // Poll every 30s — enough to stay fresh without hammering the server
    const interval = setInterval(stableFetch, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init, stableFetch]);

  const handleLogout = () => {
    destroy();
    logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 12px' : '20px 24px',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex', alignItems: 'center', gap: 12,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        {!collapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>AssessHub</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Admin Panel</div>
          </motion.div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ padding: '16px 12px', flex: 1 }}>
        {NAV_ITEMS.map(({ path, icon: Icon, label, end }) => (
          <NavLink
            key={path} to={path} end={end}
            onClick={() => setMobileOpen(false)}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12,
              padding: collapsed ? '12px' : '11px 16px',
              borderRadius: 10, marginBottom: 4,
              color: isActive ? '#fff' : 'var(--text-muted)',
              background: isActive ? 'var(--gradient-primary)' : 'transparent',
              textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 400,
              transition: 'all 0.2s ease',
              justifyContent: collapsed ? 'center' : 'flex-start',
              boxShadow: isActive ? '0 4px 15px rgba(99,102,241,0.3)' : 'none',
            })}
          >
            <Icon size={20} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div style={{
        padding: collapsed ? '16px 12px' : '16px 20px',
        borderTop: '1px solid var(--border-light)',
      }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div className="avatar" style={{ width: 38, height: 38, fontSize: 15 }}>
              {user?.fullName?.[0] || 'A'}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.fullName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Administrator</div>
            </div>
          </div>
        )}
        <button onClick={handleLogout} className="btn btn-ghost" style={{
          width: '100%', justifyContent: collapsed ? 'center' : 'flex-start',
          color: 'var(--danger)', fontSize: 13, padding: '8px 12px',
        }}>
          <LogOut size={18} /> {!collapsed && 'Sign Out'}
        </button>
      </div>
    </>
  );

  return (
    <div className="layout">
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0,
          background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-light)',
          display: 'flex', flexDirection: 'column', zIndex: 100, overflow: 'hidden',
        }}
        className="sidebar-desktop"
      >
        <SidebarContent />
      </motion.aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 998 }}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25 }}
              style={{
                position: 'fixed', left: 0, top: 0, bottom: 0, width: 260,
                background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-light)',
                display: 'flex', flexDirection: 'column', zIndex: 999, overflow: 'hidden',
              }}
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <main style={{
        marginLeft: collapsed ? 72 : 260,
        flex: 1, transition: 'margin-left 0.3s ease',
        minHeight: '100vh',
      }}>
        {/* Top bar */}
        <header style={{
          padding: '14px 28px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(15,16,25,0.8)', backdropFilter: 'blur(12px)',
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => { if (window.innerWidth < 768) setMobileOpen(true); else setCollapsed(!collapsed); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13 }}>
              <Shield size={14} /> <span>Admin</span> <ChevronRight size={12} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>
        <div style={{ padding: '28px' }}>
          <Outlet />
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
