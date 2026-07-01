import React, { useState } from 'react';
import { Shield, AlertTriangle, XCircle, ChevronRight, ChevronLeft, Loader2, Clock, Send, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MonitoringPanel } from './MonitoringPanel';
import { QuestionDisplay } from './QuestionDisplay';

export function ExamLayout({
  assessment, questionsCount, currentQ, violations, maxViolations,
  videoRef, streamRef, question, answers, handleSelect,
  handleNext, handlePrev, handleJumpTo, submitting, submitExam, cancelExam,
  timer, user, questions
}) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const progress = ((currentQ + 1) / questionsCount) * 100;
  const hasAnswer = (answers[question?._id]?.selectedOptions?.length || 0) > 0;

  // Count answered vs unanswered questions
  const answeredCount = questions?.filter(q => (answers[q._id]?.selectedOptions?.length || 0) > 0).length || 0;
  const unansweredCount = questionsCount - answeredCount;

  const isLastQuestion = currentQ >= questionsCount - 1;
  const isFirstQuestion = currentQ === 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', userSelect: 'none', display: 'flex', flexDirection: 'column' }}>
      {/* ─── Enhanced Top Bar ─── */}
      <div style={{
        padding: '10px 24px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        {/* Left: Live indicator + Exam title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* 🔴 Live Proctoring Indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(239,68,68,0.1)', padding: '6px 14px', borderRadius: 99,
            border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
              boxShadow: '0 0 10px rgba(239,68,68,0.6)',
              animation: 'pulse 2s infinite',
            }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#ef4444', letterSpacing: '0.08em' }}>LIVE</span>
          </div>

          <div style={{ width: 1, height: 24, background: 'var(--border-light)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} color="var(--primary-light)" />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{assessment?.title}</span>
          </div>
        </div>

        {/* Right: Timer + Candidate + Question + Violations */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Timer */}
          {timer !== undefined && (
            <span style={{
              fontSize: 13, fontWeight: 800,
              color: timer <= 10 ? '#ef4444' : 'var(--text-primary)',
              background: timer <= 10 ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
              padding: '6px 14px', borderRadius: 8,
              border: `1.5px solid ${timer <= 10 ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: timer <= 10 ? '0 0 10px rgba(239,68,68,0.2)' : 'none',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <Clock size={14} className={timer <= 10 ? "animate-pulse" : ""} />
              <span>{timer}s</span>
            </span>
          )}

          <div style={{ width: 1, height: 24, background: 'var(--border-light)' }} />

          {/* Candidate name */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.03)', padding: '6px 14px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <User size={14} color="var(--text-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {user?.fullName || 'Candidate'}
            </span>
          </div>

          {/* Question progress */}
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary-light)' }}>
            Q {currentQ + 1}/{questionsCount}
          </span>

          {/* Violations */}
          <span className={`badge ${violations > 0 ? 'badge-danger' : 'badge-muted'}`} style={{ padding: '6px 12px', fontSize: 12 }}>
            <AlertTriangle size={14} /> {violations}/{maxViolations}
          </span>
        </div>
      </div>

      {/* ─── Progress Bar ─── */}
      <div className="progress-bar" style={{ height: 4, borderRadius: 0 }}>
        <div className="progress-fill" style={{ width: `${progress}%`, transition: 'width 0.3s' }} />
      </div>

      {/* ─── Main Content: 3-column grid ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 260px', gap: 24, padding: '24px', flex: 1, alignItems: 'start' }}>

        {/* LEFT: Camera + Question Navigation Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MonitoringPanel videoRef={videoRef} streamRef={streamRef} />

          {/* Question Navigation Panel */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 16,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 12,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Questions</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                {answeredCount}/{questionsCount} answered
              </span>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
            }}>
              {questions?.map((q, i) => {
                const isAnswered = (answers[q._id]?.selectedOptions?.length || 0) > 0;
                const isCurrent = i === currentQ;

                let bgColor, borderColor, textColor;
                if (isCurrent) {
                  bgColor = 'var(--gradient-primary)';
                  borderColor = 'var(--primary)';
                  textColor = '#fff';
                } else if (isAnswered) {
                  bgColor = 'rgba(16,185,129,0.15)';
                  borderColor = 'rgba(16,185,129,0.4)';
                  textColor = '#10b981';
                } else {
                  bgColor = 'rgba(255,255,255,0.03)';
                  borderColor = 'rgba(255,255,255,0.08)';
                  textColor = 'var(--text-muted)';
                }

                return (
                  <button
                    key={q._id || i}
                    onClick={() => handleJumpTo(i)}
                    style={{
                      width: '100%', aspectRatio: '1', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: bgColor,
                      border: `1.5px solid ${borderColor}`,
                      color: textColor,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isCurrent ? '0 2px 10px rgba(99,102,241,0.3)' : 'none',
                    }}
                    onMouseEnter={e => {
                      if (!isCurrent) {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.background = 'rgba(99,102,241,0.1)';
                        e.currentTarget.style.color = 'var(--primary-light)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isCurrent) {
                        e.currentTarget.style.borderColor = borderColor;
                        e.currentTarget.style.background = bgColor;
                        e.currentTarget.style.color = textColor;
                      }
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gradient-primary)' }} /> Current
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(16,185,129,0.4)', border: '1px solid rgba(16,185,129,0.6)' }} /> Answered
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }} /> Unanswered
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: Question Display */}
        <div className="card" style={{ padding: 40 }}>
          <AnimatePresence mode="wait">
            <motion.div key={currentQ} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
              <QuestionDisplay
                question={question}
                selectedOptions={answers[question?._id]?.selectedOptions || []}
                onSelect={handleSelect}
              />

              {/* Navigation buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, gap: 12 }}>
                {/* Left group: Cancel + Previous */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn"
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={submitting}
                    style={{
                      background: 'transparent', border: '1.5px solid rgba(239,68,68,0.4)',
                      color: '#ef4444', borderRadius: 10, padding: '10px 18px',
                      fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontSize: 13,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ef4444'; }}
                  >
                    <XCircle size={15} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                    Cancel
                  </button>

                  {!isFirstQuestion && (
                    <button
                      className="btn"
                      onClick={handlePrev}
                      disabled={submitting}
                      style={{
                        background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-secondary)', borderRadius: 10, padding: '10px 18px',
                        fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontSize: 13,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                      <ChevronLeft size={16} /> Previous
                    </button>
                  )}
                </div>

                {/* Right group: Next + Submit */}
                <div style={{ display: 'flex', gap: 10 }}>
                  {!isLastQuestion && (
                    <button className="btn btn-primary" onClick={handleNext} disabled={submitting || !hasAnswer}
                      style={{ borderRadius: 10, padding: '10px 22px', fontSize: 13 }}
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  )}

                  {/* Submit Exam button — ONLY on the last question */}
                  {isLastQuestion && (
                    <button
                      className="btn"
                      onClick={() => setShowSubmitConfirm(true)}
                      disabled={submitting || answeredCount === 0}
                      style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 10, padding: '10px 22px',
                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontSize: 13,
                        boxShadow: '0 4px 15px rgba(16,185,129,0.3)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #059669, #047857)';
                        e.currentTarget.style.boxShadow = '0 4px 20px rgba(16,185,129,0.5)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(16,185,129,0.3)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <Send size={14} /> Submit Exam
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* RIGHT: Stats sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Exam progress card */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 14 }}>Exam Progress</div>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--primary-light)' }}>
                {Math.round(progress)}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>completed</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.1)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Answered</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>{answeredCount}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.1)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unanswered</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b' }}>{unansweredCount}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.1)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary-light)' }}>{questionsCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Cancel Confirmation Modal ─── */}
      {showCancelConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999,
        }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card" style={{ padding: 32, maxWidth: 400, width: '100%', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '2px solid rgba(239,68,68,0.2)' }}>
              <AlertTriangle size={32} color="#ef4444" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>Cancel Exam?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
              Are you sure you want to cancel? All your progress will be lost and this will be recorded as a cancelled attempt.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn" onClick={() => setShowCancelConfirm(false)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)' }}
              >Keep Going</button>
              <button className="btn" onClick={() => { setShowCancelConfirm(false); cancelExam(); }}
                style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none' }}
              >Yes, Cancel</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ─── Submit Confirmation Modal ─── */}
      {showSubmitConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999,
        }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card" style={{ padding: 32, maxWidth: 440, width: '100%', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '2px solid rgba(16,185,129,0.2)' }}>
              <Send size={28} color="#10b981" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>Submit Exam?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
              Please review your answers before submitting. You cannot change your answers after submission.
            </p>

            {/* Summary */}
            <div style={{
              display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 24,
              padding: '16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981' }}>{answeredCount}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Answered</div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#f59e0b' }}>{unansweredCount}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Unanswered</div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary-light)' }}>{questionsCount}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Total</div>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 8, marginBottom: 20,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <AlertTriangle size={16} color="#f59e0b" />
                <span style={{ fontSize: 13, color: '#fbbf24', fontWeight: 500 }}>
                  You have {unansweredCount} unanswered question{unansweredCount > 1 ? 's' : ''}. Unanswered questions will be marked as incorrect.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn" onClick={() => setShowSubmitConfirm(false)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)' }}
              >Go Back</button>
              <button className="btn" onClick={() => { setShowSubmitConfirm(false); submitExam(); }}
                disabled={submitting}
                style={{
                  flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none',
                  fontWeight: 700, boxShadow: '0 4px 15px rgba(16,185,129,0.3)',
                }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <><Send size={14} /> Confirm Submit</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
