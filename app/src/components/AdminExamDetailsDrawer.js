import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, User, Mail, Building2, Briefcase, Hash, Phone, Clock,
  CheckCircle2, AlertTriangle, ShieldAlert, Monitor, Camera, Target, Activity, Map, Trophy,
  PlayCircle, RefreshCw, Slash, MessageSquare, Download, FileSpreadsheet
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function AdminExamDetailsDrawer({ userId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const pollingRef = useRef(null);

  const fetchData = async (isPolling = false) => {
    if (!userId) return;
    if (!isPolling) setLoading(true);
    
    try {
      const res = await api.get(`/admin/users/${userId}/exam-details`);
      if (res.data?.success) {
        setData(res.data.data);
        setError(null);
      } else {
        setError('Failed to fetch details');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error fetching exam details');
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchData();
    } else {
      setData(null);
      setError(null);
    }
    
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Set up polling if exam is In Progress
  useEffect(() => {
    if (data?.user?.status === 'In Progress') {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => {
          fetchData(true);
        }, 10000); // 10 seconds polling
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }, [data?.user?.status]);

  if (!userId) return null;

  const renderStatusBadge = (status) => {
    let color = '#94a3b8';
    let bg = '#f1f5f9';
    switch (status) {
      case 'Completed': color = '#10b981'; bg = '#d1fae5'; break;
      case 'In Progress': color = '#f59e0b'; bg = '#fef3c7'; break;
      case 'Terminated': color = '#ef4444'; bg = '#fee2e2'; break;
      case 'Not Started': color = '#64748b'; bg = '#f1f5f9'; break;
      default: break;
    }
    return (
      <span style={{ backgroundColor: bg, color: color, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
        {status}
      </span>
    );
  };

  return (
    <AnimatePresence>
      {userId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
              backdropFilter: 'blur(2px)'
            }}
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: '100%', maxWidth: 800, backgroundColor: 'var(--bg-card)',
              zIndex: 1001, boxShadow: '-5px 0 25px rgba(0,0,0,0.1)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Exam Details</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Complete overview of candidate's exam activity</p>
              </div>
              <button onClick={onClose} className="btn btn-ghost" style={{ padding: 8 }}>
                <X size={20} />
              </button>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, backgroundColor: 'var(--bg-main)' }}>
              
              {loading && !data ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="card" style={{ height: 150, animation: 'pulse 1.5s infinite ease-in-out', backgroundColor: 'var(--border-light)' }} />
                  ))}
                </div>
              ) : error ? (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--danger)' }}>
                  <AlertTriangle size={48} style={{ margin: '0 auto 16px' }} />
                  <h3>{error}</h3>
                </div>
              ) : data ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  
                  {/* User Profile Card */}
                  <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700 }}>
                      {data.user?.fullName?.[0]?.toUpperCase() || <User />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h2 style={{ margin: '0 0 4px', fontSize: 22 }}>{data.user?.fullName || 'Unknown User'}</h2>
                          <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)', fontSize: 13, flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Hash size={14} /> {data.user?.employeeId}</span>
                            {data.user?.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={14} /> {data.user?.email}</span>}
                            {data.user?.department && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Building2 size={14} /> {data.user?.department}</span>}
                            {data.user?.role && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Briefcase size={14} /> {data.user?.role}</span>}
                            {data.user?.phoneNumber && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={14} /> {data.user?.phoneNumber}</span>}
                          </div>
                        </div>
                        {renderStatusBadge(data.user?.status)}
                      </div>
                    </div>
                  </div>

                  {data.exam && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                      {/* Exam Details */}
                      <div className="card">
                        <h3 style={{ fontSize: 16, borderBottom: '1px solid var(--border-light)', paddingBottom: 12, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Target size={18} color="var(--primary)" /> Exam Information
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 12px', fontSize: 13 }}>
                          <div>
                            <div style={{ color: 'var(--text-muted)' }}>Assessment Name</div>
                            <div style={{ fontWeight: 600 }}>{data.exam.examName || '—'}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)' }}>Duration</div>
                            <div style={{ fontWeight: 600 }}>{data.exam.totalDuration || '—'}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)' }}>Start Time</div>
                            <div style={{ fontWeight: 600 }}>{data.exam.startTime ? new Date(data.exam.startTime).toLocaleString() : '—'}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-muted)' }}>End Time</div>
                            <div style={{ fontWeight: 600 }}>{data.exam.endTime ? new Date(data.exam.endTime).toLocaleString() : '—'}</div>
                          </div>
                          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 16, marginTop: 8 }}>
                            <div style={{ flex: 1, padding: 12, backgroundColor: 'var(--bg-main)', borderRadius: 8, textAlign: 'center' }}>
                              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>{data.exam.finalScore} / {data.exam.totalQuestions}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score</div>
                            </div>
                            <div style={{ flex: 1, padding: 12, backgroundColor: 'var(--bg-main)', borderRadius: 8, textAlign: 'center' }}>
                              <div style={{ fontSize: 24, fontWeight: 800, color: data.exam.resultStatus === 'Pass' ? '#10b981' : '#ef4444' }}>{data.exam.percentage}%</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{data.exam.resultStatus}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Proctoring Stats */}
                      <div className="card">
                        <h3 style={{ fontSize: 16, borderBottom: '1px solid var(--border-light)', paddingBottom: 12, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ShieldAlert size={18} color="var(--primary)" /> Proctoring Info
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 12px', fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Camera size={16} color={data.proctoring.cameraStatus ? '#10b981' : '#ef4444'} /> 
                            <span>Camera: {data.proctoring.cameraStatus ? 'Enabled' : 'Disabled'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Monitor size={16} color={data.proctoring.screenSharingStatus ? '#10b981' : '#ef4444'} /> 
                            <span>Screen: {data.proctoring.screenSharingStatus ? 'Shared' : 'Not Shared'}</span>
                          </div>
                          
                          <div style={{ gridColumn: 'span 2', marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                             <span className="badge badge-warning" style={{ fontSize: 11 }}>Tab Switches: {data.proctoring.tabSwitchCount}</span>
                             <span className="badge badge-warning" style={{ fontSize: 11 }}>Focus Loss: {data.proctoring.windowBlurCount}</span>
                             <span className="badge badge-warning" style={{ fontSize: 11 }}>Faces: {data.proctoring.numberOfFacesDetected}</span>
                             <span className="badge badge-danger" style={{ fontSize: 11 }}>Violations: {data.proctoring.violationHistory}</span>
                             <span className="badge badge-danger" style={{ fontSize: 11 }}>AI Score: {data.proctoring.aiSuspiciousActivityScore}/100</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}


                  {/* No Exam Fallback */}
                  {!data.exam && (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                       <Activity size={48} style={{ color: 'var(--border)' }} />
                       <h3>No Exam Data Found</h3>
                       <p>This user has not started or submitted an exam yet.</p>
                    </div>
                  )}

                </div>
              ) : (
                <div className="empty-state" style={{ padding: '40px 20px' }}>
                  <p>No data available</p>
                </div>
              )}
            </div>
            
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
