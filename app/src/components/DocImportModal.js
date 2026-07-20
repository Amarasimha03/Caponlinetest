/**
 * DocImportModal.js
 * Production-ready .docx Question Import Modal
 *
 * Features:
 *  - Drag & Drop + Browse upload
 *  - File type/size validation (client-side)
 *  - Animated 5-step progress tracker
 *  - Duplicate resolution dialog
 *  - Import summary with stats
 *  - Error report table + CSV download
 *  - Download sample Word template
 *  - Cancel / Retry support
 *  - Zero data loss guarantee messaging
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, FileText, CheckCircle, AlertTriangle, AlertCircle,
  Download, RefreshCw, ChevronRight, Clock, Layers, ZapOff,
  SkipForward, RotateCcw, Eye, File
} from 'lucide-react';
import api from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_MB = 20;
const STEPS = [
  { id: 'upload',    label: 'Uploading...',           pct: 15 },
  { id: 'read',      label: 'Reading Document...',    pct: 35 },
  { id: 'extract',   label: 'Extracting Questions...', pct: 58 },
  { id: 'validate',  label: 'Validating...',           pct: 78 },
  { id: 'save',      label: 'Saving Assessment...',    pct: 92 },
  { id: 'complete',  label: 'Completed',               pct: 100 },
];

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1200,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 18,
    width: '100%', maxWidth: 720,
    maxHeight: '94vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
  },
  header: {
    padding: '22px 28px 18px',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '24px 28px',
  },
  footer: {
    padding: '16px 28px',
    borderTop: '1px solid var(--border-light)',
    display: 'flex', gap: 10, justifyContent: 'flex-end',
    flexShrink: 0,
    background: 'var(--bg-surface)',
  },
  dropZone: (isDragging, hasFile, isError) => ({
    border: `2px dashed ${isError ? 'var(--danger)' : hasFile ? 'var(--success)' : isDragging ? 'var(--primary)' : 'var(--border-light)'}`,
    borderRadius: 14,
    padding: '40px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    background: isDragging
      ? 'rgba(99,102,241,0.07)'
      : hasFile
      ? 'rgba(16,185,129,0.05)'
      : isError
      ? 'rgba(239,68,68,0.05)'
      : 'rgba(255,255,255,0.02)',
    transition: 'all 0.25s ease',
    userSelect: 'none',
  }),
  progressBar: (pct, color = 'var(--primary)') => ({
    height: 6, borderRadius: 99,
    background: `linear-gradient(90deg, ${color} ${pct}%, var(--border-light) ${pct}%)`,
    transition: 'background 0.5s ease',
  }),
  chip: (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
    background: `${color}20`, color, border: `1px solid ${color}40`,
  }),
  statCard: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-light)',
    borderRadius: 12, padding: '14px 18px', textAlign: 'center',
    flex: 1,
  },
  tableHeader: {
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '8px 12px', background: 'var(--bg-surface)',
  },
  tableCell: {
    fontSize: 12, color: 'var(--text-secondary)',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-light)',
  },
};

// ─── Helper: format file size ─────────────────────────────────────────────────
const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

// ─── Helper: download CSV error report ───────────────────────────────────────
function downloadErrorReport(errors, fileName) {
  if (!errors || errors.length === 0) return;
  const headers = ['Line Number', 'Question Number', 'Error', 'Reason', 'Suggested Fix'];
  const rows = errors.map(e => [
    e.lineNumber || '-',
    e.questionNumber || '-',
    `"${(e.error || '').replace(/"/g, '""')}"`,
    `"${(e.reason || '').replace(/"/g, '""')}"`,
    `"${(e.suggestedFix || '').replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import-errors-${fileName || 'report'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helper: download sample Word template ────────────────────────────────────
function downloadSampleTemplate() {
  const template = `SAMPLE QUESTION TEMPLATE
========================

Instructions: Format each question as shown below.

1. What is the capital of France?
A) London
B) Berlin
C) Paris
D) Rome
Answer: C
Marks: 2
Difficulty: Easy
Explanation: Paris is the capital and most populous city of France.

2. Which data structure uses LIFO order?
A) Queue
B) Stack
C) Array
D) Linked List
Answer: B
Marks: 2
Difficulty: Medium
Explanation: Stack follows Last In First Out (LIFO) principle.

3. What does HTML stand for?
A) Hyper Text Markup Language
B) High Transfer Markup Language
C) Hyper Transfer Machine Language
D) Home Tool Markup Language
Answer: A
Marks: 1
Difficulty: Easy
Explanation: HTML stands for Hyper Text Markup Language.

SUPPORTED FORMATS:
- Numbered questions: 1. or Q1. or Question 1.
- Options: A) or A. or (A) or [A]
- Answer: Answer: A  or  Correct: B  or  Ans: C
- Marks: Marks: 2  (default: 1)
- Difficulty: Difficulty: Easy / Medium / Hard  (default: Medium)
- Explanation: Explanation: ... (optional)

TABLE FORMAT (also supported):
Create a table with columns:
Question | Option A | Option B | Option C | Option D | Answer | Marks | Difficulty
`;

  const blob = new Blob([template], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'question-import-template.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Phase components ─────────────────────────────────────────────────────────

function UploadZone({ file, isDragging, hasError, errorMsg, onFileSelect, onDrop, onDragOver, onDragLeave, onRemove }) {
  return (
    <div>
      <div
        style={S.dropZone(isDragging, !!file, hasError)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !file && onFileSelect()}
      >
        {!file ? (
          <>
            <motion.div
              animate={{ y: isDragging ? -6 : 0 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <Upload size={40} color={isDragging ? 'var(--primary)' : 'var(--text-muted)'} style={{ marginBottom: 12 }} />
            </motion.div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              {isDragging ? 'Drop your .docx file here' : 'Drag & drop your Word document'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              or <span style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>browse files</span>
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span style={S.chip('#6366f1')}>✓ .docx only</span>
              <span style={S.chip('#10b981')}>✓ Max 20MB</span>
              <span style={S.chip('#f59e0b')}>✗ .doc, PDF, images rejected</span>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ background: 'rgba(16,185,129,0.15)', borderRadius: 12, padding: 12 }}>
              <FileText size={28} color='var(--success)' />
            </div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{file.name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtSize(file.size)} • .docx</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--danger)' }}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {hasError && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p style={{ fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <AlertCircle size={14} /> {errorMsg}
          </p>
        </motion.div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
        {file && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onFileSelect}
            style={{ fontSize: 12 }}
          >
            <RefreshCw size={13} /> Replace File
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={downloadSampleTemplate}
          style={{ fontSize: 12, color: 'var(--text-muted)' }}
        >
          <Download size={13} /> Download Sample Template
        </button>
      </div>
    </div>
  );
}

function ProgressTracker({ step, progress }) {
  return (
    <div style={{ padding: '8px 0' }}>
      {/* Main progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary-light)' }}>
            {STEPS[step]?.label || 'Processing...'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
            {progress}%
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: 'var(--border-light)', overflow: 'hidden' }}>
          <motion.div
            style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #6366f1, #a855f7)' }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STEPS.map((s, i) => {
          const isDone = i < step;
          const isActive = i === step;
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: isDone || isActive ? 1 : 0.35,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? 'rgba(16,185,129,0.15)' : isActive ? 'rgba(99,102,241,0.2)' : 'var(--border-light)',
                border: `2px solid ${isDone ? 'var(--success)' : isActive ? 'var(--primary)' : 'transparent'}`,
              }}>
                {isDone
                  ? <CheckCircle size={14} color='var(--success)' />
                  : isActive
                  ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}>
                      <RefreshCw size={13} color='var(--primary)' />
                    </motion.div>
                  : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{i + 1}</span>
                }
              </div>
              <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {s.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function DuplicateResolutionPanel({ duplicates, actions, onActionChange }) {
  return (
    <div>
      <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
        <p style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>
          <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {duplicates.length} Duplicate Question(s) Detected
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Choose an action for each duplicate before saving.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['skip', 'ignore', 'replace'].map(action => (
          <button
            key={action}
            type="button"
            className="btn btn-sm"
            style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}
            onClick={() => duplicates.forEach(d => onActionChange(String(d.questionNumber), action))}
          >
            {action === 'skip' && <><SkipForward size={11} /> Set all to Skip</>}
            {action === 'ignore' && <><Eye size={11} /> Set all to Import Anyway</>}
            {action === 'replace' && <><RotateCcw size={11} /> Set all to Replace</>}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {duplicates.map((dup) => {
          const qNumStr = String(dup.questionNumber);
          const curAction = actions[qNumStr] || 'skip';
          return (
            <div key={dup.questionNumber} style={{ border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)' }}>Q{dup.questionNumber}</span>
                    {dup.lineNumber && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>Line {dup.lineNumber}</span>}
                    {dup.reason && <span style={{ fontSize: 11, color: '#fbbf24', marginLeft: 8 }}>• {dup.reason}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { value: 'skip', label: 'Skip', color: 'var(--text-muted)' },
                      { value: 'ignore', label: 'Import Anyway', color: 'var(--info)' },
                      { value: 'replace', label: 'Replace', color: 'var(--warning)' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onActionChange(qNumStr, opt.value)}
                        style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                          border: `1px solid ${curAction === opt.value ? opt.color : 'var(--border-light)'}`,
                          background: curAction === opt.value ? `${opt.color}20` : 'transparent',
                          color: curAction === opt.value ? opt.color : 'var(--text-muted)',
                          fontWeight: curAction === opt.value ? 700 : 400,
                          transition: 'all 0.15s',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ padding: '10px 14px' }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  "{dup.questionText?.substring(0, 120)}{dup.questionText?.length > 120 ? '...' : ''}"
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImportSummary({ summary, errors }) {
  const allGood = summary.failed === 0 && summary.skipped === 0;
  return (
    <div>
      {/* Success / Partial header */}
      <div style={{
        textAlign: 'center', marginBottom: 24, padding: '20px 16px',
        borderRadius: 14,
        background: allGood ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
        border: `1px solid ${allGood ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
      }}>
        {allGood
          ? <CheckCircle size={40} color='var(--success)' style={{ marginBottom: 10 }} />
          : <AlertTriangle size={40} color='#f59e0b' style={{ marginBottom: 10 }} />
        }
        <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
          {allGood ? 'Assessment Imported Successfully' : 'Import Completed with Warnings'}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{summary.fileName}</p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Document Questions', value: summary.documentQuestions, color: '#6366f1' },
          { label: 'Imported', value: summary.imported, color: '#10b981' },
          { label: 'Skipped', value: summary.skipped, color: '#f59e0b' },
          { label: 'Failed', value: summary.failed, color: '#ef4444' },
          { label: 'Duplicates', value: summary.duplicates, color: '#8b5cf6' },
          { label: 'Processing Time', value: summary.processingTime, color: '#0ea5e9' },
        ].map(s => (
          <div key={s.label} style={S.statCard}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, marginBottom: 2 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Error report */}
      {errors && errors.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Error Report ({errors.length} issue{errors.length !== 1 ? 's' : ''})
            </h4>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11 }}
              onClick={() => downloadErrorReport(errors, summary.fileName)}
            >
              <Download size={12} /> Download CSV
            </button>
          </div>
          <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Line', 'Q#', 'Error', 'Reason', 'Suggested Fix'].map(h => (
                    <th key={h} style={S.tableHeader}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <td style={S.tableCell}>{e.lineNumber || '-'}</td>
                    <td style={S.tableCell}>{e.questionNumber || '-'}</td>
                    <td style={{ ...S.tableCell, color: 'var(--danger)' }}>{e.error}</td>
                    <td style={S.tableCell}>{e.reason}</td>
                    <td style={{ ...S.tableCell, color: 'var(--info)' }}>{e.suggestedFix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AbortPanel({ message, errors, parseErrors, onRetry, onCancel, fileName }) {
  const allErrors = [...(errors || []), ...(parseErrors || [])];
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24, padding: '20px 16px', borderRadius: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
        <ZapOff size={40} color='var(--danger)' style={{ marginBottom: 10 }} />
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--danger)', marginBottom: 8 }}>Import Failed</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto' }}>{message}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>No data has been saved. The import was fully rolled back.</p>
      </div>

      {allErrors.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}
              onClick={() => downloadErrorReport(allErrors, fileName)}>
              <Download size={12} /> Download Error Report CSV
            </button>
          </div>
          <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Line', 'Q#', 'Error', 'Reason', 'Fix'].map(h => (
                    <th key={h} style={S.tableHeader}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allErrors.map((e, i) => (
                  <tr key={i}>
                    <td style={S.tableCell}>{e.lineNumber || '-'}</td>
                    <td style={S.tableCell}>{e.questionNumber || '-'}</td>
                    <td style={{ ...S.tableCell, color: 'var(--danger)' }}>{e.error}</td>
                    <td style={S.tableCell}>{e.reason}</td>
                    <td style={{ ...S.tableCell, color: 'var(--info)' }}>{e.suggestedFix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DocImportModal({ assessmentId, assessmentTitle, onClose, onImportComplete }) {
  // Phases: 'upload' | 'progress' | 'duplicates' | 'success' | 'abort'
  const [phase, setPhase] = useState('upload');
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [progressStep, setProgressStep] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [duplicateData, setDuplicateData] = useState(null);
  const [duplicateActions, setDuplicateActions] = useState({});
  const [importResult, setImportResult] = useState(null);
  const [abortData, setAbortData] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const fileInputRef = useRef(null);
  const progressTimerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  // ── File validation ──────────────────────────────────────────────────────
  const validateFile = useCallback((f) => {
    if (!f) return 'No file selected.';
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext !== 'docx') {
      return `Invalid file type ".${ext}". Only .docx files are accepted. Please reject .doc, PDF, images, and other formats.`;
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File too large (${fmtSize(f.size)}). Maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`;
    }
    if (f.size === 0) {
      return 'The selected file is empty.';
    }
    return '';
  }, []);

  const handleFileSelect = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback((f) => {
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      setFileError(err);
      setFile(null);
    } else {
      setFileError('');
      setFile(f);
    }
  }, [validateFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    handleFileChange(f);
  }, [handleFileChange]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  // ── Animated progress simulation ─────────────────────────────────────────
  const simulateProgress = useCallback((targetStep, targetPct) => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setProgressStep(targetStep);
    setProgressPct(prev => {
      // Will animate via React state updates
      return prev;
    });

    let current = 0;
    const target = STEPS[targetStep]?.pct || targetPct;
    progressTimerRef.current = setInterval(() => {
      current += 1;
      setProgressPct(p => {
        const next = Math.min(p + 1, target);
        if (next >= target) clearInterval(progressTimerRef.current);
        return next;
      });
    }, 20);
  }, []);

  // ── Main import function ──────────────────────────────────────────────────
  const doImport = useCallback(async (actions = {}) => {
    if (!file) {
      setFileError('Please select a .docx file to import.');
      return;
    }
    if (isSending) return;

    setIsSending(true);
    setPhase('progress');
    setProgressStep(0);
    setProgressPct(0);

    try {
      // Step 1: Uploading
      simulateProgress(0, 15);

      const formData = new FormData();
      formData.append('file', file);
      if (Object.keys(actions).length > 0) {
        formData.append('duplicateActions', JSON.stringify(actions));
      }

      // Step 2: Reading
      simulateProgress(1, 35);

      const res = await api.post(`/assessments/${assessmentId}/import-docx`, formData, {
        timeout: 120000, // 2 min for large files
      });

      // Step 3-4: Extracting + Validating (simulated)
      simulateProgress(2, 58);
      await new Promise(r => setTimeout(r, 300));
      simulateProgress(3, 78);
      await new Promise(r => setTimeout(r, 200));

      const data = res.data;

      // Step 5: Saving
      simulateProgress(4, 92);
      await new Promise(r => setTimeout(r, 250));

      // Complete
      simulateProgress(5, 100);
      setProgressPct(100);
      await new Promise(r => setTimeout(r, 400));

      if (data.requiresDuplicateResolution) {
        // Duplicates found — show resolution UI
        setDuplicateData(data);
        const initActions = {};
        [...(data.inDocDuplicates || []), ...(data.existingDuplicates || [])].forEach(d => {
          initActions[String(d.questionNumber)] = 'skip';
        });
        setDuplicateActions(initActions);
        setPhase('duplicates');
      } else if (data.success) {
        setImportResult(data);
        setPhase('success');
        if (onImportComplete) onImportComplete(data.summary?.imported || 0);
      } else {
        setAbortData({
          message: data.message,
          errors: data.errors || [],
          parseErrors: data.parseErrors || [],
        });
        setPhase('abort');
      }
    } catch (err) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      const msg = err.response?.data?.message || err.message || 'Network error. Please check your connection and try again.';
      const errData = err.response?.data || {};
      setAbortData({
        message: msg,
        errors: errData.errors || [],
        parseErrors: errData.parseErrors || [],
      });
      setPhase('abort');
    } finally {
      setIsSending(false);
    }
  }, [file, assessmentId, isSending, simulateProgress, onImportComplete]);

  // ── Duplicate resolution submit ───────────────────────────────────────────
  const handleDuplicateSubmit = useCallback(() => {
    doImport(duplicateActions);
  }, [doImport, duplicateActions]);

  const handleDuplicateActionChange = useCallback((qNum, action) => {
    setDuplicateActions(prev => ({ ...prev, [qNum]: action }));
  }, []);

  // ── Reset to upload phase ─────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setPhase('upload');
    setProgressStep(0);
    setProgressPct(0);
    setAbortData(null);
    setImportResult(null);
    setDuplicateData(null);
    setDuplicateActions({});
    setIsSending(false);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────────
  const allDuplicates = duplicateData
    ? [...(duplicateData.inDocDuplicates || []), ...(duplicateData.existingDuplicates || [])]
    : [];

  const phaseTitle = {
    upload: 'Import Word Document',
    progress: 'Importing Questions...',
    duplicates: 'Resolve Duplicates',
    success: 'Import Complete',
    abort: 'Import Failed',
  }[phase] || 'Import';

  return (
    <AnimatePresence>
      <motion.div
        style={S.overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget && phase !== 'progress') onClose(); }}
      >
        <motion.div
          style={S.modal}
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={S.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: 'rgba(99,102,241,0.15)', borderRadius: 10, padding: 8 }}>
                <FileText size={20} color='var(--primary)' />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {phaseTitle}
                </h3>
                {assessmentTitle && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {assessmentTitle}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={phase === 'progress'}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, padding: 8, cursor: phase === 'progress' ? 'not-allowed' : 'pointer', opacity: phase === 'progress' ? 0.4 : 1 }}
            >
              <X size={18} color='var(--text-muted)' />
            </button>
          </div>

          {/* Body */}
          <div style={S.body}>
            <AnimatePresence mode="wait">
              {/* Upload Phase */}
              {phase === 'upload' && (
                <motion.div key="upload" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                  <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--primary-light)', fontWeight: 600 }}>How it works:</span> Upload your .docx file → Questions are extracted in original order → Zero data loss guaranteed → Atomic save (all-or-nothing)
                    </p>
                  </div>
                  <UploadZone
                    file={file}
                    isDragging={isDragging}
                    hasError={!!fileError}
                    errorMsg={fileError}
                    onFileSelect={handleFileSelect}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onRemove={() => { setFile(null); setFileError(''); }}
                  />
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileChange(e.target.files[0])}
                  />

                  {/* Supported formats info */}
                  <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                      <Layers size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                      Supported Question Formats
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        '1. Question text\nA) Option A\nB) Option B\nAnswer: B',
                        'Q1. Question\n(A) Opt A  (B) Opt B\nCorrect: A',
                        'Question 1. ...\nA. Option\nB. Option\nAns: C',
                        'Table: Question | Option A | Option B | Answer | Marks',
                      ].map((ex, i) => (
                        <pre key={i} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 6, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                          {ex}
                        </pre>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Progress Phase */}
              {phase === 'progress' && (
                <motion.div key="progress" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                  <ProgressTracker step={progressStep} progress={progressPct} />
                  <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={12} />
                      Processing <strong style={{ color: 'var(--text-secondary)' }}>{file?.name}</strong>... Large files may take up to 30 seconds.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Duplicate Resolution Phase */}
              {phase === 'duplicates' && (
                <motion.div key="duplicates" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                  {duplicateData && (
                    <>
                      <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span style={S.chip('#6366f1')}>📄 {duplicateData.parsed} questions parsed</span>
                        <span style={S.chip('#f59e0b')}>{allDuplicates.length} duplicates found</span>
                      </div>
                      <DuplicateResolutionPanel
                        duplicates={allDuplicates}
                        actions={duplicateActions}
                        onActionChange={handleDuplicateActionChange}
                      />
                      {duplicateData.validationErrors?.length > 0 && (
                        <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <p style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
                            {duplicateData.validationErrors.length} validation issue(s) found in document
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              {/* Success Phase */}
              {phase === 'success' && importResult && (
                <motion.div key="success" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                  <ImportSummary
                    summary={importResult.summary}
                    errors={importResult.errors}
                  />
                </motion.div>
              )}

              {/* Abort Phase */}
              {phase === 'abort' && abortData && (
                <motion.div key="abort" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                  <AbortPanel
                    message={abortData.message}
                    errors={abortData.errors}
                    parseErrors={abortData.parseErrors}
                    fileName={file?.name}
                    onRetry={handleRetry}
                    onCancel={onClose}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div style={S.footer}>
            {/* Upload phase footer */}
            {phase === 'upload' && (
              <>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => doImport({})}
                  disabled={!file || !!fileError || isSending}
                  style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                >
                  <Upload size={15} />
                  Import Document
                  {file && <span style={{ fontSize: 11, opacity: 0.75 }}>({fmtSize(file.size)})</span>}
                </button>
              </>
            )}

            {/* Progress phase footer */}
            {phase === 'progress' && (
              <button type="button" className="btn btn-secondary" disabled style={{ opacity: 0.5 }}>
                Processing — please wait...
              </button>
            )}

            {/* Duplicate resolution footer */}
            {phase === 'duplicates' && (
              <>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel Import</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDuplicateSubmit}
                  disabled={isSending}
                  style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                >
                  <ChevronRight size={15} />
                  {isSending ? 'Importing...' : 'Continue Import'}
                </button>
              </>
            )}

            {/* Success phase footer */}
            {phase === 'success' && (
              <>
                {importResult?.errors?.length > 0 && (
                  <button type="button" className="btn btn-secondary" onClick={() => downloadErrorReport(importResult.errors, file?.name)}>
                    <Download size={14} /> Error Report
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  <CheckCircle size={15} /> Done
                </button>
              </>
            )}

            {/* Abort phase footer */}
            {phase === 'abort' && (
              <>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                <button type="button" className="btn btn-primary" onClick={handleRetry} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <RefreshCw size={14} /> Retry Upload
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
