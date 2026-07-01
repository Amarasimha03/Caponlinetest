const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { querySheets } = require('../services/googleSheets');

// GET live monitoring active exam sessions
router.get('/', protect, async (req, res) => {
  try {
    const resRes = await querySheets('getResults');
    const activeResults = (resRes.data || []).filter(r => r.status === 'in-progress');

    const empRes = await querySheets('getEmployees');
    const employees = empRes.data || [];
    const assRes = await querySheets('getAssessments');
    const assessments = assRes.data || [];

    const activeSockets = req.app.get('activeSockets') || new Map();
    const activeExams = [];

    for (const [empId, socketData] of activeSockets.entries()) {
      const e = employees.find(emp => String(emp._id) === String(empId));
      const a = assessments.find(ass => String(ass._id) === String(socketData.examId));

      // We still try to grab screenMonitoring state if available, but default to true if they are live
      activeExams.push({
        employeeId: empId,
        employeeName: e?.fullName || socketData.employeeName || 'Candidate',
        assessmentId: socketData.examId || '',
        assessmentTitle: a?.title || 'Exam',
        violationCount: 0, // Violations can be pulled independently by the frontend
        startedAt: socketData.joinedAt || new Date().toISOString(),
        cameraActive: true,
        screenShareStatus: 'active',
        webrtcConnected: false,
        socketId: socketData.socketId,
      });
    }

    res.json(activeExams);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
