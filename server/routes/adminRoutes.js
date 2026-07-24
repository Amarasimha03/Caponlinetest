const express = require('express');
const router = express.Router();
const { querySheets } = require('../services/googleSheets');
const { protect, adminOnly } = require('../middleware/auth');

/**
 * GET /api/admin/users/:userId/exam-details
 * Fetches comprehensive exam details for a user.
 * userId can be either the employee's _id or employeeId string.
 */
router.get('/users/:userId/exam-details', protect, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`[admin/exam-details] Request for userId: ${userId}`);

    // Fetch all necessary data concurrently
    // querySheets returns: { data: <array>, success: true } — data is a flat array
    const [empRes, resRes, assRes, qRes, violRes] = await Promise.all([
      querySheets('getEmployees'),
      querySheets('getResults'),
      querySheets('getAssessments'),
      querySheets('getQuestions'),
      querySheets('getViolations')
    ]);

    // data is a direct array from Google Sheets
    const employees     = Array.isArray(empRes.data)  ? empRes.data  : [];
    const results       = Array.isArray(resRes.data)  ? resRes.data  : [];
    const assessments   = Array.isArray(assRes.data)  ? assRes.data  : [];
    const questionsList = Array.isArray(qRes.data)    ? qRes.data    : [];
    const violationsList= Array.isArray(violRes.data) ? violRes.data : [];

    console.log(`[admin/exam-details] employees=${employees.length}, results=${results.length}, assessments=${assessments.length}`);

    // Find the user — match by _id or employeeId (string-coerced for safety)
    const user = employees.find(e =>
      String(e._id) === String(userId) ||
      String(e.employeeId) === String(userId)
    );

    if (!user) {
      console.warn(`[admin/exam-details] User not found for userId=${userId}. Available _ids: ${employees.slice(0, 5).map(e => e._id).join(', ')}`);
      return res.status(404).json({ success: false, message: `User not found for id: ${userId}` });
    }

    console.log(`[admin/exam-details] Found user: ${user.fullName} (${user._id} / ${user.employeeId})`);

    // Find all results for the user — match on any of the ID fields used across results
    const userResults = results.filter(r =>
      String(r.employeeId)      === String(user.employeeId) ||
      String(r.employeeId)      === String(user._id) ||
      String(r.employeeMongoId) === String(user._id) ||
      String(r.employee)        === String(user._id)
    );

    // Sort by most recent first
    userResults.sort((a, b) => new Date(b.submittedAt || b.createdAt || 0) - new Date(a.submittedAt || a.createdAt || 0));

    const result = userResults[0];

    // Determine overall status
    const COMPLETED = ['submitted', 'auto-submitted', 'completed', 'graded'];
    let examStatus = 'Not Started';
    if (result) {
      if (COMPLETED.includes(result.status)) examStatus = 'Completed';
      else if (result.status === 'terminated') examStatus = 'Terminated';
      else examStatus = 'In Progress';
    }

    // Build user info
    const userInfo = {
      fullName:     user.fullName || '',
      employeeId:   user.employeeId || user._id || '',
      email:        user.email || '',
      department:   user.department || 'N/A',
      role:         user.designation || user.role || 'Candidate',
      phoneNumber:  user.phone || '',
      profilePhoto: user.avatar || '',
      status:       examStatus
    };

    // No exam result found — return user info only
    if (!result) {
      return res.json({
        success: true,
        data: {
          user: userInfo,
          exam: null,
          questions: [],
          violations: [],
          timeline: [],
          proctoring: {}
        }
      });
    }

    // Find Assessment — match by assessmentId or assessment field (string-safe)
    const assessment = assessments.find(a =>
      String(a._id) === String(result.assessmentId || '') ||
      String(a._id) === String(result.assessment || '')
    ) || {};

    // Filter Violations for this result/employee
    const userViolations = violationsList.filter(v =>
      String(v.resultId)   === String(result._id) ||
      String(v.employeeId) === String(user.employeeId) ||
      String(v.employeeId) === String(user._id)
    );

    // Assemble Question Summary — answers are self-contained in Google Sheets:
    // { question (id), questionText, options[], selectedOptions[], selectedAnswer, correctAnswer, isCorrect, marksObtained, timeTaken }
    let examQuestions = [];
    const answersRaw = result.answers;
    let answersArr = [];
    try {
      answersArr = typeof answersRaw === 'string' ? JSON.parse(answersRaw) : (Array.isArray(answersRaw) ? answersRaw : []);
    } catch (e) { answersArr = []; }

    if (answersArr.length > 0) {
      examQuestions = answersArr.map((ans, idx) => {
        const isUnanswered = !ans.selectedAnswer ||
          ans.selectedAnswer === 'Not Attempted' ||
          ans.selectedAnswer === 'Not Answered' ||
          (Array.isArray(ans.selectedOptions) && ans.selectedOptions.length === 0);
        return {
          questionNumber:  idx + 1,
          questionText:    ans.questionText || ans.question || `Question ${idx + 1}`,
          selectedAnswer:  isUnanswered ? 'Not Answered' : ans.selectedAnswer,
          correctAnswer:   ans.correctAnswer || '',
          isCorrect:       ans.isCorrect === true || ans.isCorrect === 'true',
          timeSpent:       ans.timeTaken || ans.timeSpent || 0,
          markedForReview: ans.markedForReview || false
        };
      });
    }

    // Build Timeline
    const timeline = [];
    if (result.startTime) {
      timeline.push({ time: new Date(result.startTime).toISOString(), event: 'Exam Started' });
    }
    userViolations.forEach(v => {
      if (v.timestamp) {
        timeline.push({ time: new Date(v.timestamp).toISOString(), event: `Violation: ${(v.type || '').replace(/_/g, ' ')}` });
      }
    });
    if (result.submittedAt) {
      timeline.push({ time: new Date(result.submittedAt).toISOString(), event: 'Exam Submitted' });
    }
    timeline.sort((a, b) => new Date(a.time) - new Date(b.time));

    const totalQuestions  = parseInt(assessment.totalQuestions) || examQuestions.length || parseInt(result.totalQuestions) || 0;
    const answeredCount   = examQuestions.filter(q => q.selectedAnswer !== 'Not Answered').length;
    const skippedCount    = Math.max(0, totalQuestions - answeredCount);

    // Proctoring stats — read from result.proctoring or count from violations
    const vType = (type) => userViolations.filter(v => String(v.type) === type).length;

    const responseData = {
      user: userInfo,
      exam: {
        examName:        assessment.title || result.assessmentTitle || '',
        assessmentName:  assessment.title || result.assessmentTitle || '',
        examId:          assessment._id || result.assessmentId || '',
        startTime:       result.startTime || null,
        endTime:         result.submittedAt || result.endTime || null,
        totalDuration:   assessment.duration ? `${assessment.duration} mins` : (result.totalDuration || ''),
        remainingTime:   result.remainingTime || 0,
        totalQuestions,
        answeredQuestions: answeredCount,
        skippedQuestions:  skippedCount,
        markedForReview:   examQuestions.filter(q => q.markedForReview).length,
        currentQuestion:   result.currentQuestionIndex != null ? result.currentQuestionIndex + 1 : null,
        finalScore:        result.totalScore || result.score || 0,
        percentage:        result.percentage || 0,
        resultStatus:      (result.passed === true || result.passed === 'true') ? 'Pass' : 'Fail'
      },
      questions: examQuestions,
      violations: userViolations.map(v => ({
        time:        v.timestamp,
        type:        v.type,
        severity:    v.severity || 'Medium',
        actionTaken: 'Logged'
      })),
      timeline,
      proctoring: {
        cameraStatus:               result.proctoring?.cameraStatus !== false,
        screenSharingStatus:        result.proctoring?.screenStatus !== false,
        microphoneStatus:           true,
        faceDetectionStatus:        true,
        numberOfFacesDetected:      vType('multiple_faces') > 0 ? 'Multiple detected' : 1,
        tabSwitchCount:             result.proctoring?.tabSwitches   || result.tabSwitchCount  || vType('tab_switch')  || 0,
        windowBlurCount:            result.proctoring?.focusLosses   || result.focusLossCount  || vType('focus_loss')  || 0,
        fullScreenExitCount:        result.proctoring?.fullScreenExits || vType('fullscreen_exit') || 0,
        copyPasteAttempts:          vType('copy_paste')  || 0,
        rightClickAttempts:         vType('right_click') || 0,
        keyboardShortcutViolations: vType('keyboard_shortcut') || 0,
        mobileDeviceDetection:      vType('mobile_device') > 0,
        networkDisconnectCount:     vType('network_disconnect') || 0,
        aiSuspiciousActivityScore:  result.proctoring?.aiScore || Math.min(100, userViolations.length * 10),
        violationHistory:           userViolations.length
      },
      cameraSnapshots:  result.snapshots || [],
      screenRecording:  result.screenRecordingUrl || '',
      screenShareStatus: true
    };

    res.json({ success: true, data: responseData });

  } catch (error) {
    console.error('[admin/exam-details] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exam details', error: error.message });
  }
});

/**
 * DELETE /api/admin/:sheetName/:id
 * Permanently deletes a record from the specified Google Sheet.
 * Includes validation to prevent orphaned records.
 */
router.delete('/:sheetName/:id', protect, adminOnly, async (req, res) => {
  try {
    const { sheetName, id } = req.params;
    
    // Validate sheet name
    const validSheets = ['employees', 'assessments', 'questions', 'results', 'violations'];
    if (!validSheets.includes(sheetName)) {
      return res.status(400).json({ success: false, message: 'Invalid sheet name.' });
    }

    // Validation to prevent orphaned records
    if (sheetName === 'employees') {
      const [resRes, violRes] = await Promise.all([
        querySheets('getResults'),
        querySheets('getViolations')
      ]);
      const results = resRes.data || [];
      const violations = violRes.data || [];
      
      const hasResults = results.some(r => String(r.employeeId) === String(id) || String(r.employeeMongoId) === String(id));
      const hasViolations = violations.some(v => String(v.employeeId) === String(id) || String(v.employeeMongoId) === String(id));
      
      if (hasResults || hasViolations) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot delete employee: This employee has associated exam results or violations. Please delete them first.' 
        });
      }
    } else if (sheetName === 'assessments') {
      const [resRes, qRes] = await Promise.all([
        querySheets('getResults'),
        querySheets('getQuestions')
      ]);
      const results = resRes.data || [];
      const questions = qRes.data || [];
      
      const hasResults = results.some(r => String(r.assessmentId) === String(id));
      const hasQuestions = questions.some(q => String(q.assessmentId) === String(id));
      
      if (hasResults || hasQuestions) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot delete assessment: This assessment has associated questions or results. Please delete them first.' 
        });
      }
    } else if (sheetName === 'results') {
      const violRes = await querySheets('getViolations');
      const violations = violRes.data || [];
      const hasViolations = violations.some(v => String(v.resultId) === String(id));
      
      if (hasViolations) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot delete result: This result has associated violations. Please delete them first.' 
        });
      }
    }
    
    // Log intent
    console.log(`[admin/delete] Deleting ${id} from ${sheetName} by admin ${req.user._id}`);
    
    // Call Google Sheets API
    const response = await querySheets('deleteEntity', { sheetName, _id: id });
    
    if (response && response.success) {
      if (global.io) global.io.emit('db:sync');
      
      // Audit Log
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      console.log(`[Audit] DELETE - Admin: ${req.user.fullName} (${req.user._id}), Record: ${id}, Sheet: ${sheetName}, Timestamp: ${new Date().toISOString()}, IP: ${ip}, Status: Success`);
      
      return res.json({ success: true, message: 'Record deleted successfully.' });
    } else {
      console.log(`[Audit] DELETE - Admin: ${req.user.fullName}, Record: ${id}, Sheet: ${sheetName}, Status: Failed (Not Found)`);
      return res.status(404).json({ success: false, message: response?.message || 'Record not found.' });
    }
  } catch (error) {
    console.error(`[admin/delete] Error:`, error);
    console.log(`[Audit] DELETE - Admin: ${req.user.fullName}, Record: ${req.params.id}, Sheet: ${req.params.sheetName}, Status: Failed (Error)`);
    res.status(500).json({ success: false, message: 'Failed to delete record', error: error.message });
  }
});

// ─── Reports & Analytics ─────────────────────────────────────────────────────

/**
 * Build filters from query params and apply to dataset.
 * from/to filter is applied against exam's createdAt (exam published date).
 */
const buildReportsData = (results, employees, assessments, query) => {
  const { from, to, status, assessment, search } = query;

  // Step 1: filter assessments by published date (exam createdAt)
  let filteredAssessments = assessments;
  if (from || to) {
    const fromMs = from ? new Date(`${from}T00:00:00.000Z`).getTime() : 0;
    const toMs   = to   ? new Date(`${to}T23:59:59.999Z`).getTime()   : Infinity;
    filteredAssessments = assessments.filter(a => {
      const ts = a.createdAt || a.updatedAt;
      if (!ts) return false;
      const d = new Date(ts).getTime();
      return !isNaN(d) && d >= fromMs && d <= toMs;
    });
  }
  const filteredAssessmentIds = new Set(filteredAssessments.map(a => String(a._id)));

  // Step 2: keep only results whose assessment was published in the date range
  let filtered = results.filter(r => filteredAssessmentIds.has(String(r.assessmentId)));

  // Step 3: status filter (PASS / FAIL)
  if (status) {
    const want = status.toUpperCase();
    filtered = filtered.filter(r => {
      const p = String(r.passed).toLowerCase();
      if (want === 'PASS') return p === 'true';
      if (want === 'FAIL') return p === 'false';
      return true;
    });
  }

  // Step 4: assessment title filter
  if (assessment && assessment !== 'All Assessments') {
    filtered = filtered.filter(r => String(r.assessmentId) === String(assessment));
  }

  // Step 5: text search on candidate name / email
  if (search) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(r => {
      const emp = employees.find(e => String(e._id) === String(r.employeeMongoId));
      return (
        (emp?.fullName  || '').toLowerCase().includes(q) ||
        (emp?.email     || '').toLowerCase().includes(q) ||
        (emp?.employeeId || '').toLowerCase().includes(q)
      );
    });
  }

  // Step 6: sorting
  if (query.sortPct) {
    const isDesc = query.sortPct === 'desc';
    filtered.sort((a, b) => {
      const pA = parseFloat(a.percentage) || 0;
      const pB = parseFloat(b.percentage) || 0;
      if (pA !== pB) return isDesc ? pB - pA : pA - pB;
      
      const sA = parseFloat(a.totalScore) || 0;
      const sB = parseFloat(b.totalScore) || 0;
      if (sA !== sB) return isDesc ? sB - sA : sA - sB;
      
      return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0);
    });
  } else {
    // Default: sort by submittedAt desc
    filtered.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  }

  return { filtered, filteredAssessments, employees, assessments };
};

/**
 * GET /api/admin/reports
 * Query: from, to, status, assessment, search, page, limit
 */
router.get('/reports', protect, adminOnly, async (req, res) => {
  try {
    const [resRes, empRes, assRes] = await Promise.all([
      querySheets('getResults'),
      querySheets('getEmployees'),
      querySheets('getAssessments'),
    ]);

    const allResults     = Array.isArray(resRes.data) ? resRes.data : [];
    const allEmployees   = Array.isArray(empRes.data) ? empRes.data : [];
    const allAssessments = Array.isArray(assRes.data) ? assRes.data : [];

    const { filtered: filteredForTable, filteredAssessments, employees, assessments } = buildReportsData(
      allResults, allEmployees, allAssessments, req.query
    );

    // Summary metrics — always calculated WITHOUT status filter so cards show full picture
    const { filtered: filteredForSummary } = buildReportsData(
      allResults, allEmployees, allAssessments, { ...req.query, status: undefined }
    );
    const completed    = filteredForSummary.length;
    const passedCount  = filteredForSummary.filter(r => String(r.passed).toLowerCase() === 'true').length;
    const failedCount  = completed - passedCount;
    const averageScore = completed > 0
      ? Math.round(filteredForSummary.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0) / completed)
      : 0;
    const publishedExams = filteredAssessments.length;

    // Period Completed — candidates who completed exams published in the SELECTED date range
    // (not hardcoded to today — reflects whatever from/to the admin has selected)
    const todayCompleted = filteredForSummary.length;
    
    // Count unique candidates who took the exam in the selected date range
    const uniqueCandidates = new Set(filteredForSummary.map(r => String(r.employeeMongoId))).size;

    // Pagination — applied on status-filtered table data
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const totalRecords = filteredForTable.length;
    const paginated    = filteredForTable.slice((page - 1) * limit, page * limit);

    // Map to rich records
    const records = paginated.map(r => {
      const emp = employees.find(e => String(e._id) === String(r.employeeMongoId));
      const ass = assessments.find(a => String(a._id) === String(r.assessmentId));
      return {
        _id:          r._id,
        employee: {
          fullName:   emp?.fullName   || '',
          email:      emp?.email      || '',
          department: emp?.department || '',
          employeeId: emp?.employeeId || '',
        },
        assessment: {
          _id:   ass?._id   || r.assessmentId,
          title: ass?.title || '',
          createdAt: ass?.createdAt || '',
        },
        submittedAt:    r.submittedAt,
        percentage:     r.percentage,
        passed:         r.passed,
        status:         r.status,
        totalScore:     r.totalScore,
        totalMarks:     r.totalMarks,
        correctAnswers: r.correctAnswers,
        wrongAnswers:   r.wrongAnswers,
        completionTime: r.completionTime,
      };
    });

    res.json({
      summary: { publishedExams, todayCompleted, uniqueCandidates, completed, passed: passedCount, failed: failedCount, averageScore, totalOverallRecords: allResults.length },
      records,
      totalRecords,
      page,
      totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
    });
  } catch (error) {
    console.error('[admin/reports] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/admin/reports/export
 * Same filters as /reports but returns a CSV file download.
 */
router.get('/reports/export', protect, adminOnly, async (req, res) => {
  try {
    const [resRes, empRes, assRes] = await Promise.all([
      querySheets('getResults'),
      querySheets('getEmployees'),
      querySheets('getAssessments'),
    ]);

    const allResults     = Array.isArray(resRes.data) ? resRes.data : [];
    const allEmployees   = Array.isArray(empRes.data) ? empRes.data : [];
    const allAssessments = Array.isArray(assRes.data) ? assRes.data : [];

    const { filtered, employees, assessments } = buildReportsData(
      allResults, allEmployees, allAssessments, req.query
    );

    const headers = 'Rank,Candidate Name,Email,Department,Exam Name,Exam Published Date,Status,Percentage,Score,Total Marks,Correct,Wrong,Submitted At\n';
    const rows = filtered.map((r, i) => {
      const emp = employees.find(e => String(e._id) === String(r.employeeMongoId));
      const ass = assessments.find(a => String(a._id) === String(r.assessmentId));
      const pct = parseFloat(r.percentage) || 0;
      const passed = String(r.passed).toLowerCase() === 'true' ? 'PASS' : 'FAIL';
      const submittedAt = r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : '';
      const publishedAt = ass?.createdAt ? new Date(ass.createdAt).toLocaleDateString('en-IN') : '';
      return `${i + 1},"${emp?.fullName || ''}","${emp?.email || ''}","${emp?.department || ''}","${ass?.title || ''}","${publishedAt}","${passed}",${Math.round(pct)}%,${r.totalScore || 0},${r.totalMarks || 0},${r.correctAnswers || 0},${r.wrongAnswers || 0},"${submittedAt}"`;
    }).join('\n');

    const from = req.query.from || 'all';
    const to   = req.query.to   || 'all';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="reports-${from}-to-${to}.csv"`);
    res.send(headers + rows);
  } catch (error) {
    console.error('[admin/reports/export] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
