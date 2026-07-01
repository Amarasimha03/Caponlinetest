import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  React.useEffect(() => {
    // Early background warm-up fetch to spin up Render free tier container
    const wakeUpBackend = async () => {
      try {
        const fallbackUrl = "https://caponlinebackend.onrender.com/api/health";
        const targetUrl = process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL.replace(/\/$/, '')}/api/health` : fallbackUrl;
        
        // If server is cold-starting, track the timeout to show warm-up notification
        const timer = setTimeout(() => setIsWakingUp(true), 2500);

        const start = Date.now();
        const maxWaitMs = 60000;
        
        while (Date.now() - start < maxWaitMs) {
          try {
            const res = await fetch(targetUrl, {
              signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
            });
            if (res.ok) {
              clearTimeout(timer);
              setIsWakingUp(false);
              return;
            }
          } catch (err) {}
          await new Promise(r => setTimeout(r, 5000));
        }
        
        clearTimeout(timer);
        setIsWakingUp(false);
      } catch (err) {
        setIsWakingUp(false);
      }
    };
    wakeUpBackend();
  }, []);
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await login(username, password);
      toast.success(`Welcome back, ${data.user.fullName}!`);
      navigate(data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: 'url(/tech_bg.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Dark overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(5, 8, 20, 0.55)',
      }} />

      {/* Main container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          width: '100%',
          maxWidth: 860,
          margin: '0 20px',
        }}
      >
        {/* ── LEFT PANEL ── */}
        <div style={{
          flex: '0 0 380px',
          background: 'rgba(10, 14, 30, 0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRight: 'none',
          padding: '52px 44px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Interior background image */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'url(/tech_bg.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.18,
            borderRadius: 'inherit',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <h1 style={{
              fontSize: 32,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.2,
              marginBottom: 18,
              letterSpacing: '-0.5px',
            }}>
              Robust Online<br />Test Workspace
            </h1>

            <p style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.62)',
              lineHeight: 1.7,
              marginBottom: 40,
            }}>
              Unified assessment environment designed to conduct, evaluate, and proctor exams seamlessly for students and professionals.
            </p>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 40 }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#3b9eff', letterSpacing: '-0.5px' }}>99.9%</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 4 }}>Uptime</div>
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#3b9eff', letterSpacing: '-0.5px' }}>24/7</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 4 }}>Support</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{
          flex: 1,
          background: '#ffffff',
          padding: '52px 48px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          {isWakingUp && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginBottom: 16,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(59,158,255,0.08)',
                border: '1.5px solid rgba(59,158,255,0.2)',
                borderRadius: 20,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 700,
                color: '#3b9eff'
              }}>
                <Loader2 size={12} className="animate-spin" />
                <span>Connecting server...</span>
              </div>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off">
            {/* Username */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 8,
              }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <svg
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
                  width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                <input
                  id="login-username"
                  type="text"
                  placeholder="sophia"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 42px',
                    border: '1.5px solid #e5e7eb',
                    borderRadius: 10,
                    fontSize: 14,
                    color: '#111827',
                    background: '#f9fafb',
                    outline: 'none',
                    transition: 'all 0.2s',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#3b9eff';
                    e.target.style.boxShadow = '0 0 0 3px rgba(59,158,255,0.12)';
                    e.target.style.background = '#fff';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = '#f9fafb';
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 8,
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <svg
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 44px 12px 42px',
                    border: '1.5px solid #e5e7eb',
                    borderRadius: 10,
                    fontSize: 14,
                    color: '#111827',
                    background: '#f9fafb',
                    outline: 'none',
                    transition: 'all 0.2s',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#3b9eff';
                    e.target.style.boxShadow = '0 0 0 3px rgba(59,158,255,0.12)';
                    e.target.style.background = '#fff';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                    e.target.style.background = '#f9fafb';
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#9ca3af', padding: 4, display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#6b7280' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{ accentColor: '#3b9eff', width: 14, height: 14 }}
                />
                Remember me
              </label>
              <Link
                to="/forgot-password"
                style={{ fontSize: 13, color: '#3b9eff', textDecoration: 'none', fontWeight: 500 }}
              >
                Forgot Password?
              </Link>
            </div>

            {/* Sign In button */}
            <button
              id="login-submit"
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '14px',
                background: isLoading ? '#1a3a6e' : 'linear-gradient(135deg, #0d2a6e 0%, #1a3d8f 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 700,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                letterSpacing: '0.3px',
                boxShadow: '0 4px 16px rgba(10,40,110,0.35)',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (!isLoading) { e.currentTarget.style.boxShadow = '0 8px 28px rgba(10,40,110,0.5)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(10,40,110,0.35)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {isLoading ? <Loader2 size={19} className="animate-spin" /> : 'Sign In'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
