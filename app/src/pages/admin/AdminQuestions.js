import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, X, ArrowLeft, CheckCircle, Upload, Sparkles, Loader2, Save, FileUp } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import CopyButton from '../../components/CopyButton';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import DocImportModal from '../../components/DocImportModal';
import socket from '../../services/socket';

const TYPES = ['mcq', 'multiple-select', 'true-false', 'coding'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

const QuestionCard = React.memo(({ q, i, triggerDelete }) => (
  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.5) }}
    className="card" style={{ marginBottom: 12, padding: '18px 24px' }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)', minWidth: 28 }}>Q{i + 1}</span>
          <span className={`badge ${q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'hard' ? 'badge-danger' : 'badge-warning'}`}>{q.difficulty}</span>
          <span className="badge badge-primary">{q.type}</span>
          <span className="badge badge-info">{q.marks} marks</span>
          <CopyButton text={`Question:\n${q.title}\n\nOptions:\n${q.options?.map((o, idx) => `${String.fromCharCode(65 + idx)}) ${o.text}${o.isCorrect ? ' (Correct)' : ''}`).join('\n')}\n\nMarks: ${q.marks}`} />
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 10 }}>{q.title}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {Array.isArray(q.options) && q.options.length > 0 ? (
            q.options.map((opt, oi) => (
              <div key={oi} style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 13,
                background: opt.isCorrect ? 'rgba(16,185,129,0.1)' : 'var(--bg-surface)',
                border: `1px solid ${opt.isCorrect ? 'rgba(16,185,129,0.3)' : 'var(--border-light)'}`,
                color: opt.isCorrect ? '#6ee7b7' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontWeight: 'bold', color: '#c084fc', marginRight: 4 }}>
                  {String.fromCharCode(65 + oi)}.
                </span>
                {opt.isCorrect && <CheckCircle size={14} />}
                {opt.text || opt}
              </div>
            ))
          ) : (
            <p style={{ fontSize: 12, color: 'var(--danger)', gridColumn: 'span 2' }}>
              ⚠️ Options missing or incorrect format for this question
            </p>
          )}
        </div>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => triggerDelete(q._id)}>
        <Trash2 size={15} color="var(--danger)" />
      </button>
    </div>
  </motion.div>
));

const GeneratedQuestionCard = React.memo(({ q, qIdx, onUpdateQuestion, onUpdateOption, onUpdateDifficulty, onUpdateMarks, onDelete }) => {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        marginBottom: 20,
        position: 'relative'
      }}
    >
      <button
        type="button"
        onClick={() => onDelete(qIdx)}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'none',
          border: 'none',
          color: 'var(--danger)',
          cursor: 'pointer'
        }}
        title="Discard Question"
      >
        <Trash2 size={18} />
      </button>

      <div className="form-group" style={{ paddingRight: 32 }}>
        <label className="form-label" style={{ fontWeight: 600, color: 'var(--primary-light)' }}>Question {qIdx + 1}</label>
        <textarea
          className="form-input"
          value={q.title}
          onChange={e => onUpdateQuestion(qIdx, 'title', e.target.value)}
          rows={2}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">Difficulty</label>
          <select
            className="form-input form-select"
            value={q.difficulty}
            onChange={e => onUpdateDifficulty(qIdx, e.target.value)}
          >
            {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Marks</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Min: 1, Max: 100</span>
          </label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {[1, 2, 5, 10].map(m => (
              <button
                key={m}
                type="button"
                className="btn"
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  background: q.marks === m ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                  color: q.marks === m ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${q.marks === m ? 'var(--primary)' : 'var(--border-light)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onClick={() => onUpdateMarks(qIdx, m)}
              >
                {m} {m === 1 ? 'Mark' : 'Marks'}
              </button>
            ))}
          </div>
          <input
            className="form-input"
            type="number"
            value={q.marks}
            onChange={e => onUpdateMarks(qIdx, Math.max(1, Math.min(100, +e.target.value)))}
            min={1}
            max={100}
            required
          />
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontWeight: 600 }}>Options (select the single correct answer)</label>
        {q.options.map((opt, oIdx) => (
          <div key={oIdx} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <input
              type="radio"
              name={`correct-gen-${qIdx}`}
              checked={opt.isCorrect}
              onChange={() => onUpdateOption(qIdx, oIdx, 'isCorrect', true)}
              style={{ accentColor: 'var(--primary)', width: 16, height: 16 }}
            />
            <input
              className="form-input"
              value={opt.text}
              onChange={e => onUpdateOption(qIdx, oIdx, 'text', e.target.value)}
              placeholder={`Option ${oIdx + 1}`}
              style={{ flex: 1, marginBottom: 0 }}
              required
            />
          </div>
        ))}
      </div>
    </div>
  );
});

const emptyForm = {
  title: '', type: 'mcq', marks: 1, difficulty: 'medium',
  options: [{ text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }],
};

export default function AdminQuestions() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAutoGenerateModal, setShowAutoGenerateModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showDocImport, setShowDocImport] = useState(false);

  const [showDeleteImportedModal, setShowDeleteImportedModal] = useState(false);
  const [isDeletingImported, setIsDeletingImported] = useState(false);
  const [deleteImportedMessage, setDeleteImportedMessage] = useState('');
  const importedQuestionsCount = questions.filter(q => q.source === 'DOCUMENT_IMPORT').length;

  const lastLoadedIdRef = React.useRef(null);

  const load = useCallback(async () => {
    try {
      const aRes = await api.get(`/assessments/${assessmentId}`);
      const assessment = aRes.data.assessment;
      const uniqueQuestions = Array.from(
        new Map(
          (assessment.questions || []).map(q => [q._id || q.title || q.question, q])
        ).values()
      );
      const sortedQ = uniqueQuestions.sort((a, b) =>
        String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true, sensitivity: 'base' })
      );
      setQuestions(sortedQ);
      setAssessment(assessment);
    } catch { toast.error('Failed to load'); }
    setLoading(false);
  }, [assessmentId]);

  useEffect(() => {
    if (lastLoadedIdRef.current !== assessmentId) {
      setQuestions([]);
      setAssessment(null);
      setGeneratedQuestions([]);
      setLoading(true);
      lastLoadedIdRef.current = assessmentId;
    }
    
    load();
    socket.on('db:sync', () => {
      console.log('📡 Real-time sync signal received: updating question list');
      load();
    });
    return () => {
      socket.off('db:sync');
    };
  }, [assessmentId, load]);

  const handleAddQuestion = () => {
    setForm(emptyForm);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/questions', { ...form, assessmentId, assessment: assessmentId });
      toast.success('Question added');
      setShowModal(false);
      setForm(emptyForm);
      localStorage.removeItem('admin_assessments_list');
      await load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const triggerDelete = useCallback((id) => {
    setDeleteTarget(id);
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget;
    setDeleteLoading(true);
    setDeleteTarget(null);

    try {
      await api.delete(`/questions/${targetId}`);
      toast.success('Question permanently deleted');
      // Update state immediately without refresh
      setQuestions(prev => prev.filter(q => q._id !== targetId));
      localStorage.removeItem('admin_assessments_list');
    } catch {
      toast.error('Failed to delete question');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteImported = async () => {
    setIsDeletingImported(true);
    setDeleteImportedMessage('');
    try {
      const res = await api.delete(`/assessments/${assessmentId}/imported-questions`);
      if (res.data.success) {
        setDeleteImportedMessage(`✓ ${res.data.message}`);
        
        // Update state immediately
        setQuestions(prev => prev.filter(q => q.source !== 'DOCUMENT_IMPORT'));
        toast.success(`✓ ${res.data.deletedQuestions || 30} imported questions deleted successfully.`);
        
        setTimeout(() => {
          setShowDeleteImportedModal(false);
          setIsDeletingImported(false);
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      setDeleteImportedMessage(err.response?.data?.message || 'Unable to delete imported questions. Please try again.');
      setIsDeletingImported(false);
    }
  };

  const updateOption = (idx, field, value) => {
    const opts = [...form.options];
    if (field === 'isCorrect' && form.type === 'mcq') {
      opts.forEach((o, i) => o.isCorrect = i === idx);
    } else {
      opts[idx] = { ...opts[idx], [field]: value };
    }
    setForm({ ...form, options: opts });
  };

  const handleAutoGenerateUpload = () => {
    setGeneratedQuestions([]);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.txt';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      setIsGenerating(true);
      const reader = new FileReader();
      const isTxt = file.name.toLowerCase().endsWith('.txt');

      reader.onload = async (ev) => {
        try {
          let fileContent = '';
          if (isTxt) {
            fileContent = ev.target.result;
          } else {
            fileContent = ev.target.result.split(',')[1];
          }

          toast.loading('Analyzing document and generating high-quality MCQs...', { id: 'mcq-gen' });

          const response = await api.post('/questions/generate', {
            fileName: file.name,
            fileContent: fileContent
          });

          toast.dismiss('mcq-gen');

          if (response.data.success && response.data.questions.length > 0) {
            toast.success(`Generated ${response.data.questions.length} questions from ${file.name}!`);
            setGeneratedQuestions(response.data.questions);
            setShowAutoGenerateModal(true);
          } else {
            toast.error('Could not generate questions. Try a different document.');
          }
        } catch (err) {
          toast.dismiss('mcq-gen');
          toast.error(err.response?.data?.message || 'Failed to process document');
        } finally {
          setIsGenerating(false);
        }
      };

      if (isTxt) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleUpdateGeneratedQuestion = useCallback((idx, field, value) => {
    setGeneratedQuestions(prev => {
      const list = [...prev];
      list[idx] = { ...list[idx], [field]: value };
      return list;
    });
  }, []);

  const handleDeleteGeneratedQuestion = useCallback((idx) => {
    setGeneratedQuestions(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleUpdateGeneratedOption = useCallback((qIdx, oIdx, field, value) => {
    setGeneratedQuestions(prev => {
      const list = [...prev];
      const opts = [...list[qIdx].options];
      if (field === 'isCorrect') {
        opts.forEach((o, i) => { o.isCorrect = i === oIdx; });
      } else {
        opts[oIdx] = { ...opts[oIdx], [field]: value };
      }
      list[qIdx] = { ...list[qIdx], options: opts };
      return list;
    });
  }, []);

  const handleUpdateGeneratedDifficulty = useCallback((qIdx, diff) => {
    setGeneratedQuestions(prev => {
      const list = [...prev];
      const marks = diff === 'easy' ? 1 : diff === 'medium' ? 2 : 3;
      list[qIdx] = { ...list[qIdx], difficulty: diff, marks };
      return list;
    });
  }, []);

  const handleUpdateGeneratedMarks = useCallback((qIdx, marksValue) => {
    setGeneratedQuestions(prev => {
      const list = [...prev];
      list[qIdx] = { ...list[qIdx], marks: marksValue };
      return list;
    });
  }, []);

  const handleSaveGeneratedQuestions = async () => {
    if (generatedQuestions.length === 0) {
      toast.error('No questions to save');
      return;
    }

    for (let i = 0; i < generatedQuestions.length; i++) {
      const q = generatedQuestions[i];
      if (!q.title.trim()) {
        toast.error(`Question ${i + 1} title cannot be empty`);
        return;
      }
      const correctCount = q.options.filter(o => o.isCorrect).length;
      if (correctCount === 0) {
        toast.error(`Please select a correct answer for Question ${i + 1}`);
        return;
      }
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j].text.trim()) {
          toast.error(`Option ${j + 1} of Question ${i + 1} cannot be empty`);
          return;
        }
      }
    }

    setIsSaving(true);
    const toastId = toast.loading('Saving and syncing questions to Google Sheets...');

    try {
      await api.post('/questions/bulk', {
        questions: generatedQuestions,
        assessmentId
      });
      toast.success('Successfully saved all questions to Google Sheets!', { id: toastId });
      localStorage.removeItem('admin_assessments_list');
      setShowAutoGenerateModal(false);
      setGeneratedQuestions([]);
      
      setLoading(true);
      await load(); 
    } catch (err) {
      console.error(err);
      toast.error('Failed to save questions', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const SkeletonQuestionCard = () => (
    <div className="card" style={{ marginBottom: 12, padding: '18px 24px', animation: 'pulse 1.5s infinite ease-in-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ height: 20, width: 30, backgroundColor: 'var(--border-light)', borderRadius: 4 }} />
        <div style={{ height: 20, width: 60, backgroundColor: 'var(--border-light)', borderRadius: 4 }} />
        <div style={{ height: 20, width: 50, backgroundColor: 'var(--border-light)', borderRadius: 4 }} />
        <div style={{ height: 20, width: 70, backgroundColor: 'var(--border-light)', borderRadius: 4 }} />
      </div>
      <div style={{ height: 16, width: '70%', backgroundColor: 'var(--border-light)', borderRadius: 4, marginBottom: 16 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: 36, width: '100%', backgroundColor: 'var(--border-light)', borderRadius: 8 }} />
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header-row">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/assessments')} style={{ marginBottom: 8 }}>
            <ArrowLeft size={16} /> Back to Assessments
          </button>
          <div className="page-header" style={{ marginBottom: 0 }}>
            <h1>Questions: {assessment?.title}</h1>
            <p>{questions.length} questions • {assessment?.duration} min duration</p>
          </div>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={handleAutoGenerateUpload}
            disabled={isGenerating}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            AI Generate
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowDocImport(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))', border: '1px solid rgba(99,102,241,0.4)', color: 'var(--primary-light)', fontWeight: 600 }}
          >
            <FileUp size={16} />
            Import .docx
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setDeleteImportedMessage('');
              setShowDeleteImportedModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: 'var(--danger)', color: 'var(--danger)' }}
          >
            <Trash2 size={16} />
            Delete Imported MCQs
          </button>
          <button className="btn btn-primary" onClick={handleAddQuestion}><Plus size={18} /> Add Question</button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          [...Array(4)].map((_, i) => <SkeletonQuestionCard key={i} />)
        ) : questions?.length > 0 ? (
          questions.map((q, i) => (
            <QuestionCard key={`${q._id}-${q.title || q.question}`} q={q} i={i} triggerDelete={triggerDelete} />
          ))
        ) : (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <h3>No questions yet</h3>
            <p>Add questions manually, import JSON, or generate with AI using Upload Document!</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)}>
            <motion.div className="modal" style={{ maxWidth: 620 }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Add Question</h3>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Question</label>
                  <textarea className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required rows={2} placeholder="Enter the question..." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-input form-select" value={form.type} onChange={e => {
                      const type = e.target.value;
                      let options = form.options;
                      if (type === 'true-false') options = [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }];
                      else if (options.length < 4) options = [{ text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }];
                      setForm({ ...form, type, options });
                    }}>
                      {TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Difficulty</label>
                    <select className="form-input form-select" value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
                      {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Marks</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Min: 1, Max: 100</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {[1, 2, 5, 10].map(m => (
                      <button
                        key={m}
                        type="button"
                        className="btn"
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          background: form.marks === m ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                          color: form.marks === m ? '#fff' : 'var(--text-secondary)',
                          border: `1px solid ${form.marks === m ? 'var(--primary)' : 'var(--border-light)'}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontWeight: form.marks === m ? 600 : 400,
                          transition: 'all 0.2s',
                        }}
                        onClick={() => setForm({ ...form, marks: m })}
                      >
                        {m} {m === 1 ? 'Mark' : 'Marks'}
                      </button>
                    ))}
                  </div>
                  <input className="form-input" type="number" value={form.marks} onChange={e => {
                    const val = Math.max(1, Math.min(100, +e.target.value));
                    setForm({ ...form, marks: val });
                  }} min={1} max={100} required />
                </div>

                <div className="form-group">
                  <label className="form-label">Options (check correct answers)</label>
                  {form.options.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                      <input type={form.type === 'multiple-select' ? 'checkbox' : 'radio'} name="correct"
                        checked={opt.isCorrect} onChange={() => updateOption(i, 'isCorrect', !opt.isCorrect)}
                        style={{ accentColor: 'var(--primary)' }} />
                      <input className="form-input" value={opt.text} onChange={e => updateOption(i, 'text', e.target.value)}
                        placeholder={`Option ${i + 1}`} style={{ flex: 1, marginBottom: 0 }}
                        required disabled={form.type === 'true-false'} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Add Question</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAutoGenerateModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ zIndex: 1000 }} onClick={() => setShowAutoGenerateModal(false)}>
            <motion.div
              className="modal"
              style={{ maxWidth: 850, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={20} color="#a855f7" />
                    <h3 className="modal-title">Review Generated MCQs</h3>
                  </div>
                  <button className="modal-close" onClick={() => setShowAutoGenerateModal(false)}><X size={20} /></button>
                </div>
                
                {generatedQuestions.length > 0 && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 10, 
                    background: 'rgba(168,85,247,0.08)', 
                    padding: '8px 16px', 
                    borderRadius: 8, 
                    border: '1px dashed rgba(168,85,247,0.3)',
                    width: '100%',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#c084fc' }}>⚡ Bulk set all marks:</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 2, 5, 10].map(m => {
                        const isActive = generatedQuestions.length > 0 && generatedQuestions.every(q => q.marks === m);
                        return (
                          <button
                            key={m}
                            type="button"
                            className="btn"
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              background: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                              color: isActive ? '#fff' : 'var(--text-primary)',
                              border: isActive ? '1px solid var(--primary)' : '1px solid var(--border-light)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontWeight: isActive ? 600 : 400,
                              transition: 'all 0.2s',
                            }}
                            onClick={() => {
                              const updated = generatedQuestions.map(q => ({ ...q, marks: m }));
                              setGeneratedQuestions(updated);
                              toast.success(`Successfully set all questions to ${m} ${m === 1 ? 'mark' : 'marks'}!`);
                            }}
                          >
                            {m} {m === 1 ? 'Mark' : 'Marks'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px', marginTop: 12 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                  AI has generated the following questions. You can review, edit options, change difficulty (marks will update automatically), or delete questions before adding them to your assessment.
                </p>

                {generatedQuestions.map((q, qIdx) => (
                  <GeneratedQuestionCard
                    key={`${qIdx}-${q.title}`}
                    q={q}
                    qIdx={qIdx}
                    onUpdateQuestion={handleUpdateGeneratedQuestion}
                    onUpdateOption={handleUpdateGeneratedOption}
                    onUpdateDifficulty={handleUpdateGeneratedDifficulty}
                    onUpdateMarks={handleUpdateGeneratedMarks}
                    onDelete={handleDeleteGeneratedQuestion}
                  />
                ))}

                {generatedQuestions.length === 0 && (
                  <div className="empty-state" style={{ padding: '40px 0' }}>
                    <h3>No questions left</h3>
                    <p>All questions were discarded. Close this modal and upload another document to generate questions.</p>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'flex-end',
                  padding: '16px 24px',
                  borderTop: '1px solid var(--border-light)',
                  background: 'var(--bg-surface)'
                }}
              >
                <button type="button" className="btn btn-secondary" onClick={() => setShowAutoGenerateModal(false)} disabled={isSaving}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveGeneratedQuestions}
                  disabled={generatedQuestions.length === 0 || isSaving}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isSaving ? `Saving ${generatedQuestions.length} Questions...` : `Save all ${generatedQuestions.length} Questions`}
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
        title="Delete Question"
        message="Are you sure you want to permanently delete this MCQ? This will completely remove it from Google Sheets database."
        loading={deleteLoading}
      />

      {/* Word Document Import Modal */}
      {showDocImport && (
        <DocImportModal
          assessmentId={assessmentId}
          assessmentTitle={assessment?.title}
          onClose={() => setShowDocImport(false)}
          onImportComplete={async (count) => {
            toast.success(`✅ ${count} question(s) imported successfully from Word document!`);
            localStorage.removeItem('admin_assessments_list');
            setLoading(true);
            await load();
          }}
        />
      )}

      {/* Delete Imported MCQs Confirmation Modal */}
      <AnimatePresence>
        {showDeleteImportedModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteImportedModal(false)}>
            <motion.div className="modal" style={{ maxWidth: 450, padding: 24, textAlign: 'center' }} initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} onClick={e => e.stopPropagation()}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Trash2 size={28} color="var(--danger)" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Delete Imported Questions?</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                This action will permanently delete all questions imported from documents for this assessment.
              </p>
              
              <div style={{ background: 'var(--bg-surface)', padding: 16, borderRadius: 12, marginBottom: 20, textAlign: 'left', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Assessment:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{assessment?.title || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Imported Questions:</span>
                  <span style={{ fontWeight: 800, color: 'var(--danger)' }}>{importedQuestionsCount}</span>
                </div>
              </div>

              {importedQuestionsCount === 0 && !deleteImportedMessage && (
                <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>
                  No imported questions found for this assessment.
                </div>
              )}

              {deleteImportedMessage && (
                <div style={{ padding: '12px', background: deleteImportedMessage.includes('✓') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: deleteImportedMessage.includes('✓') ? 'var(--success)' : 'var(--danger)', borderRadius: 8, fontSize: 13, marginBottom: 20, fontWeight: 500 }}>
                  {deleteImportedMessage}
                </div>
              )}

              <p style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600, marginBottom: 24 }}>This action cannot be undone.</p>
              
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={() => setShowDeleteImportedModal(false)} disabled={isDeletingImported}>Cancel</button>
                <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleDeleteImported} disabled={isDeletingImported || importedQuestionsCount === 0}>
                  {isDeletingImported ? <Loader2 size={16} className="animate-spin" /> : 'Delete All'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
