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

module.exports = router;
