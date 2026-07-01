import React, { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';
import socket from './services/socket';

// Layout
import AdminLayout from './layouts/AdminLayout';
import EmployeeLayout from './layouts/EmployeeLayout';

// Pages via Lazy Loading (Code Splitting)
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminEmployees = lazy(() => import('./pages/admin/AdminEmployees'));
const AdminAssessments = lazy(() => import('./pages/admin/AdminAssessments'));
const AdminQuestions = lazy(() => import('./pages/admin/AdminQuestions'));
const AdminResults = lazy(() => import('./pages/admin/AdminResults'));
const AdminViolations = lazy(() => import('./pages/admin/AdminViolations'));
const AdminMonitoring = lazy(() => import('./pages/admin/AdminMonitoring'));
const EmployeeDashboard = lazy(() => import('./pages/employee/Dashboard/EmployeeDashboard'));

const ExamPage = lazy(() => import('./pages/employee/Exam/ExamPage'));
const ResultPage = lazy(() => import('./pages/employee/Result/ResultPage'));
const ExamTerminatedPage = lazy(() => import('./pages/employee/Terminated/ExamTerminatedPage'));

const NavigateToResult = () => {
  const { examId } = useParams();
  return <Navigate to={`/employee/result/${examId}`} replace />;
};

const ProtectedRoute = ({ children, role }) => {
  const { user, token, isLoading } = useAuthStore();

  // Fallback: read directly from localStorage in case Zustand hasn't hydrated yet
  const localToken = token || localStorage.getItem('token');
  const localUser = user || (() => {
    try {
      const s = localStorage.getItem('portal_user') || localStorage.getItem('user');
      if (!s || s === 'undefined') return null;
      return JSON.parse(s);
    } catch { return null; }
  })();

  // Only block render if we're loading AND have no user anywhere (neither store nor localStorage)
  if (isLoading && !localUser) {
    return <div className="loading-center"><div className="loading-spinner" /></div>;
  }
  if (!localToken) return <Navigate to="/login" replace />;
  if (role && localUser && localUser.role !== role) {
    return <Navigate to={localUser.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }
  return children;
};

function App() {
  const { fetchMe, token, user } = useAuthStore();

  useEffect(() => {
    // Early non-blocking background fetch to wake up Render free tier container quickly
    const wakeUpBackend = async () => {
      try {
        const fallbackUrl = "https://caponlinebackend.onrender.com/api/health";
        const targetUrl = process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL.replace(/\/$/, '')}/api/health` : fallbackUrl;
        
        const start = Date.now();
        const maxWaitMs = 60000;
        
        while (Date.now() - start < maxWaitMs) {
          try {
            const res = await fetch(targetUrl, {
              signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
            });
            if (res.ok) return;
          } catch (err) {}
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {}
    };
    wakeUpBackend();
  }, []);

  useEffect(() => {
    if (token) {
      if (!user) {
        fetchMe();
      }
      if (!socket.connected) {
        socket.connect();
      }

      // Async background preloading of admin lazy route bundles for 0.0s redirect/routing latency
      const savedUser = localStorage.getItem('portal_user') || localStorage.getItem('user');
      let parsedUser = null;
      if (savedUser && savedUser !== 'undefined') {
        try {
          parsedUser = JSON.parse(savedUser);
        } catch { }
      }
      const isAdmin = user?.role === 'admin' || parsedUser?.role === 'admin';
      if (isAdmin) {
        import('./pages/admin/AdminDashboard').catch(() => { });
        import('./pages/admin/AdminEmployees').catch(() => { });
        import('./pages/admin/AdminAssessments').catch(() => { });
        import('./pages/admin/AdminResults').catch(() => { });
        import('./pages/admin/AdminViolations').catch(() => { });
        import('./pages/admin/AdminMonitoring').catch(() => { });
      }
    } else {
      if (socket.connected) {
        socket.disconnect();
      }
    }
  }, [token, user, fetchMe]);

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#12141f', color: '#f1f5f9', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '14px 18px' },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
      <Suspense fallback={<div className="loading-center"><div className="loading-spinner" /></div>}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/exam-terminated" element={<ExamTerminatedPage />} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="employees" element={<AdminEmployees />} />
            <Route path="assessments" element={<AdminAssessments />} />
            <Route path="questions/:assessmentId" element={<AdminQuestions />} />
            <Route path="results" element={<AdminResults />} />
            <Route path="result/:employeeId/:examId" element={<ResultPage />} />
            <Route path="results/:resultId" element={<ResultPage />} />
            <Route path="violations" element={<AdminViolations />} />
            <Route path="monitoring" element={<AdminMonitoring />} />
          </Route>

          {/* Employee */}
          <Route path="/employee" element={<ProtectedRoute role="employee"><EmployeeLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/employee/dashboard" replace />} />
            <Route path="dashboard" element={<EmployeeDashboard />} />

            <Route path="result/:examId" element={<ResultPage />} />
            <Route path="result/:examId/:resultId" element={<ResultPage />} />
            <Route path="results/:resultId" element={<ResultPage />} />
          </Route>

          {/* Fallbacks & Compatibility */}
          <Route path="/dashboard" element={<Navigate to="/employee/dashboard" replace />} />
          <Route path="/dashboard/result/:examId" element={<NavigateToResult />} />

          {/* Exam - fullscreen mode, no layout */}
          <Route path="/exam/:assessmentId" element={<ProtectedRoute role="employee"><ExamPage /></ProtectedRoute>} />

          {/* Default */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
