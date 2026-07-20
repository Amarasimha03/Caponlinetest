/**
 * routes/assessments.js
 *
 * ROUTE ORDER MATTERS IN EXPRESS:
 *   Static paths  ('/test', '/stats', '/start') MUST come before parameterized ('/:id')
 *   Sub-routes    ('/:id/import-docx')          MUST come before plain ('/:id')
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, adminOnly } = require('../middleware/auth');
const {
  getAssessments, getMyAssessments, getAssessment,
  createAssessment, updateAssessment, deleteAssessment,
  deleteImportedQuestions,
  startExam, submitExam, getDashboardStats, bulkAssignExam
} = require('../controllers/assessmentController');
const { importDocxQuestions, getImportLogs } = require('../controllers/docImportController');
const { apiCacheMiddleware } = require('../middleware/cache');

// ─── Multer config: memory storage, 20 MB limit, .docx only ──────────────────
const docxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === '.docx' || file.mimetype === allowedMime || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error(`Only .docx files are accepted. Received type: "${ext || file.mimetype}"`), false);
    }
  },
});

// ─── Multer error wrapper ─────────────────────────────────────────────────────
function handleUpload(req, res, next) {
  docxUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File too large. Maximum allowed size is 20MB.' });
      }
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}

// All routes below require authentication
router.use(protect);

// ══════════════════════════════════════════════════════════════════════════════
// ①  DIAGNOSTIC ENDPOINT — must be first so /:id does not swallow it
// ══════════════════════════════════════════════════════════════════════════════
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Assessment routes working',
    routes: [
      'GET  /api/assessments/test            ← you are here',
      'GET  /api/assessments/stats',
      'GET  /api/assessments/my',
      'GET  /api/assessments/',
      'POST /api/assessments/',
      'POST /api/assessments/start',
      'POST /api/assessments/submit',
      'GET  /api/assessments/:id',
      'PUT  /api/assessments/:id',
      'DEL  /api/assessments/:id',
      'POST /api/assessments/:id/assign-bulk',
      'POST /api/assessments/:id/import-docx  ← docx import',
      'GET  /api/assessments/:id/import-logs',
      'DEL  /api/assessments/:id/imported-questions',
    ],
  });
});

// ②  STATIC dashboard/collection routes (must come before /:id)
router.get('/stats', adminOnly, apiCacheMiddleware(), getDashboardStats);
router.get('/my', getMyAssessments);
router.get('/', adminOnly, apiCacheMiddleware(), getAssessments);
router.post('/', adminOnly, createAssessment);

// ③  STATIC action paths (must come before /:id)
router.post('/start', startExam);
router.post('/submit', submitExam);

// ④  SUB-RESOURCE routes on /:id  (must come before plain /:id so Express tries
//     the more specific pattern first)
router.post('/:id/assign-bulk', adminOnly, bulkAssignExam);

// ── Word Document (.docx) Import ─────────────────────────────────────────────
router.post(
  '/:id/import-docx',
  adminOnly,
  (req, res, next) => {
    console.log(`[import-docx] ▶ REQUEST HIT — assessmentId="${req.params.id}" user="${req.user?._id || 'unknown'}"`);
    console.log(`[import-docx] content-type: ${req.headers['content-type']}`);
    next();
  },
  handleUpload,
  importDocxQuestions
);

router.get('/:id/import-logs', adminOnly, getImportLogs);
router.delete('/:id/imported-questions', adminOnly, deleteImportedQuestions);

// ⑤  PARAMETERIZED single-resource routes (must be LAST)
router.get('/:id', apiCacheMiddleware(), getAssessment);
router.put('/:id', adminOnly, updateAssessment);
router.delete('/:id', adminOnly, deleteAssessment);

module.exports = router;
