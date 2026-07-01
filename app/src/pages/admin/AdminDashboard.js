import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, FileText, CheckCircle, TrendingUp, TrendingDown, AlertTriangle, Clock, Award, BarChart3 } from 'lucide-react';
import api from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function AdminDashboard() {
  const [stats, setStats] = useState(() => {
    try {
      const cached = localStorage.getItem('admin_dashboard_stats');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [analytics, setAnalytics] = useState(() => {
    try {
      const cached = localStorage.getItem('admin_dashboard_analytics');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [violations, setViolations] = useState(() => {
    try {
      const cached = localStorage.getItem('admin_dashboard_violations');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [, setLoading] = useState(() => {
    return !localStorage.getItem('admin_dashboard_stats');
  });

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const hasCache = !!localStorage.getItem('admin_dashboard_stats');
    if (!hasCache) setLoading(true);
    try {
      const [statsRes, analyticsRes, violRes] = await Promise.all([
        api.get('/assessments/stats'),
        api.get('/results/analytics'),
        api.get('/violations/stats'),
      ]);
      setStats(statsRes.data.stats);
      setAnalytics(analyticsRes.data.analytics);
      setViolations(violRes.data.stats || []);
      
      localStorage.setItem('admin_dashboard_stats', JSON.stringify(statsRes.data.stats));
      localStorage.setItem('admin_dashboard_analytics', JSON.stringify(analyticsRes.data.analytics));
      localStorage.setItem('admin_dashboard_violations', JSON.stringify(violRes.data.stats || []));
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const CustomBarLabel = ({ x, y, width, height, value, index, data }) => {
    const count = data[index]?.count || 0;
    return (
      <text x={x + width / 2} y={y - 10} fill="#f8fafc" textAnchor="middle" fontSize="13" fontWeight="700">
        {count} users
      </text>
    );
  };

  const statCards = [
    { icon: Users, label: 'Total Employees', value: stats?.totalEmployees || 0, color: '#6366f1', bg: 'rgba(99,102,241,0.15)', trend: 'up' },
    { icon: FileText, label: 'Assessments', value: stats?.activeAssessments || 0, color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)', trend: 'up' },
    { icon: CheckCircle, label: 'Completed Exams', value: stats?.totalExamsTaken || 0, color: '#10b981', bg: 'rgba(16,185,129,0.15)', trend: 'up' },
    { icon: TrendingUp, label: 'Avg Score', value: `${analytics?.avgScore || 0}%`, color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', trend: analytics?.avgScore > 60 ? 'up' : 'down' },
  ];

  const deptData = analytics?.departmentPerformance?.map(d => ({ name: d._id || 'N/A', score: Math.round(d.avgScore), count: d.count })) || [];
  const pieData = [
    { name: 'Passed', value: analytics?.passedResults || 0 },
    { name: 'Failed', value: analytics?.failedResults || 0 },
  ];
  const totalPie = pieData[0].value + pieData[1].value;

  const maxViolations = Math.max(...(violations.length ? violations.map(v => v.count) : [1]), 1);

  return (
    <div style={{ background: '#0F1117', minHeight: '100vh', padding: '24px', fontFamily: "'Inter', 'Geist', sans-serif", color: '#e2e8f0', borderRadius: '16px' }}>
      <style>{`
        .premium-glass-card {
          background: rgba(22, 27, 43, 0.5);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .premium-glass-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          border-radius: 16px;
          padding: 2px;
          background: linear-gradient(135deg, rgba(99,102,241,1), rgba(168,85,247,1), rgba(236,72,153,1));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity 0.4s ease;
          pointer-events: none;
        }

        .premium-glass-card:hover {
          box-shadow: 0 0 30px rgba(99,102,241,0.15);
          transform: translateY(-2px);
          background: rgba(30, 36, 56, 0.6);
        }

        .premium-glass-card:hover::before {
          opacity: 1;
        }

        .quick-stat-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          position: relative;
        }
        .quick-stat-item:last-child {
          border-bottom: none;
        }
        .quick-stat-item::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          height: 2px;
          width: 25%;
          background: var(--underline-color);
          border-radius: 2px;
        }
        .quick-stat-value {
          font-size: 24px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .violation-bar-bg {
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.08);
          border-radius: 4px;
          margin-top: 8px;
          overflow: hidden;
        }
        .violation-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #f59e0b, #ef4444);
          border-radius: 4px;
          transition: width 0.5s ease-out;
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <div>
          <h1 style={{ color: '#f8fafc', fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>Dashboard Overview</h1>
          <p style={{ color: '#94a3b8', margin: 0 }}>Real-time overview of your assessment platform</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        {statCards.map((s, i) => (
          <motion.div
            key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.2 }} className="premium-glass-card"
            style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '24px' }}
          >
            <div style={{ background: s.bg, padding: '16px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <s.icon size={28} color={s.color} />
            </div>
            <div>
              <h3 style={{ fontSize: '32px', fontWeight: '800', color: '#f8fafc', margin: '0 0 4px 0' }}>{s.value}</h3>
              <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0, fontWeight: '500' }}>{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '28px' }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.2 }} className="premium-glass-card">
          <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 24px 0', color: '#f8fafc', display: 'flex', alignItems: 'center' }}>
            <BarChart3 size={20} style={{ marginRight: '10px', color: '#818cf8' }} />
            Department Performance
          </h3>
          <div style={{ height: '320px', width: '100%', minWidth: 0 }}>
            {deptData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: 'rgba(15, 17, 23, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f8fafc', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} />
                  <Bar dataKey="count" name="Users" fill="url(#barGradient)" radius={[8, 8, 0, 0]} label={<CustomBarLabel data={deptData} />} />
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c084fc" />
                      <stop offset="100%" stopColor="#4f46e5" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No department data yet</div>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.2 }} className="premium-glass-card">
          <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 24px 0', color: '#f8fafc', display: 'flex', alignItems: 'center' }}>
            <Award size={20} style={{ marginRight: '10px', color: '#10b981' }} />
            Pass/Fail Ratio
          </h3>
          <div style={{ height: '320px', width: '100%', position: 'relative', minWidth: 0 }}>
            {totalPie > 0 ? (
              <>
                <div style={{ position: 'absolute', inset: 0, paddingBottom: '30px', marginLeft: '60px', marginRight: '60px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={90} 
                        dataKey="value" stroke="rgba(0,0,0,0.2)" strokeWidth={2}
                      >
                        {pieData.map((_, i) => <Cell key={i} fill={i === 0 ? '#10b981' : '#ef4444'} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'rgba(15, 17, 23, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f8fafc' }} />
                      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                        <tspan x="50%" dy="-5" fontSize="36" fontWeight="800" fill="#f8fafc">{totalPie}</tspan>
                        <tspan x="50%" dy="26" fontSize="14" fontWeight="600" fill="#94a3b8" letterSpacing="1px" textTransform="uppercase">Total</tspan>
                      </text>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Left side — Passed count */}
                <div style={{ position: 'absolute', left: '8%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '28px', fontWeight: '800', color: '#10b981' }}>{pieData[0].value}</span>
                  <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '500' }}>Passed</span>
                </div>

                {/* Right side — Failed count */}
                <div style={{ position: 'absolute', right: '8%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '28px', fontWeight: '800', color: '#ef4444' }}>{pieData[1].value}</span>
                  <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '500' }}>Failed</span>
                </div>

                {/* Bottom legend with percentages */}
                <div style={{ position: 'absolute', bottom: '0', left: 0, width: '100%', display: 'flex', justifyContent: 'center', gap: '24px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ color: '#94a3b8', fontSize: '15px', fontWeight: '500' }}>
                      Passed <span style={{ color: '#10b981', fontWeight: '700' }}>{Math.round((pieData[0].value/totalPie)*100)}%</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }} />
                    <span style={{ color: '#94a3b8', fontSize: '15px', fontWeight: '500' }}>
                      Failed <span style={{ color: '#ef4444', fontWeight: '700' }}>{Math.round((pieData[1].value/totalPie)*100)}%</span>
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No results yet</div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Violations & Quick Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.2 }} className="premium-glass-card">
          <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 24px 0', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#f59e0b" /> Violation Breakdown
          </h3>
          {violations.length > 0 ? violations.map((v, i) => {
            const name = v._id ? v._id.replace('-', ' ') : 'Unknown Violation';
            const width = Math.min((v.count / maxViolations) * 100, 100);
            return (
              <div key={i} style={{ padding: '14px 0', borderBottom: i < violations.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#cbd5e1', textTransform: 'capitalize', fontWeight: '500' }}>{name}</span>
                  <span style={{ fontSize: '15px', fontWeight: '800', color: '#f8fafc' }}>{v.count}</span>
                </div>
                <div className="violation-bar-bg">
                  <div className="violation-bar-fill" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          }) : <p style={{ color: '#94a3b8', fontSize: '15px', padding: '20px 0', textAlign: 'center', margin: 0 }}>No violations recorded</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.2 }} className="premium-glass-card">
          <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 24px 0', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={20} color="#3b82f6" /> Quick Stats
          </h3>
          {[
            { label: 'Pass Rate', value: `${analytics?.passRate || 0}%`, color: '#10b981', trend: 'up' },
            { label: 'Avg Score', value: `${analytics?.avgScore || 0}%`, color: '#3b82f6', trend: 'up' },
            { label: 'Avg Completion Time', value: `${analytics?.avgCompletionTime || 0} min`, color: '#a855f7', trend: 'down' },
            { label: 'Total Violations', value: analytics?.totalViolations || 0, color: '#ef4444', trend: 'down' },
          ].map((item, i) => (
            <div key={i} className="quick-stat-item" style={{ '--underline-color': item.color }}>
              <span style={{ fontSize: '15px', color: '#cbd5e1', fontWeight: '500' }}>{item.label}</span>
              <div className="quick-stat-value" style={{ color: item.color }}>
                {item.value}
                {item.trend === 'up' ? <TrendingUp size={20} strokeWidth={3} /> : <TrendingDown size={20} strokeWidth={3} />}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
