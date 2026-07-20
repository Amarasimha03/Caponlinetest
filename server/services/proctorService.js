const { querySheets } = require('./googleSheets');

class ProctorService {
  constructor() {
    // Stores active exams: userId -> { examId, socketId, focusLossCount, multiplePersonCount, tabSwitchCount, faceMissingCount, lastPing }
    this.activeExams = new Map();
  }

  // Threshold limits
  LIMITS = {
    FOCUS_LOSS: 4,
    MULTIPLE_PERSON: 4,
    TAB_SWITCH: 3,
    FACE_MISSING: 4,
  };

  /**
   * Start tracking a user's exam session
   */
  joinExam(userId, examId, socketId, employeeName) {
    this.activeExams.set(userId, {
      examId,
      socketId,
      employeeName,
      focusLossCount: 0,
      multiplePersonCount: 0,
      tabSwitchCount: 0,
      faceMissingCount: 0,
      status: '🟢 Safe',
      lastPing: Date.now()
    });
    console.log(`[ProctorService] User ${userId} joined exam ${examId}`);
  }

  /**
   * Remove tracking when an exam finishes or user disconnects permanently
   */
  leaveExam(userId) {
    this.activeExams.delete(userId);
    console.log(`[ProctorService] User ${userId} left exam.`);
  }

  /**
   * Get all active exam metrics (for admin dashboard)
   */
  getAllActiveMetrics() {
    const metrics = [];
    this.activeExams.forEach((data, userId) => {
      // Determine connection status (e.g. offline if no ping in 10s)
      const isOnline = Date.now() - data.lastPing < 10000;
      metrics.push({
        userId,
        ...data,
        isOnline
      });
    });
    return metrics;
  }

  /**
   * Receive a ping to keep session alive
   */
  ping(userId) {
    const session = this.activeExams.get(userId);
    if (session) {
      session.lastPing = Date.now();
    }
  }

  /**
   * Process a violation event from a user.
   * Returns an object indicating what action should be taken:
   * { action: 'warn', message: '...', currentCount, maxCount } OR { action: 'terminate', reason: '...' }
   */
  processViolation(userId, type, description, screenshotBase64 = null) {
    const session = this.activeExams.get(userId);
    if (!session) return { action: 'ignore' };

    let currentCount = 0;
    let maxCount = 0;
    let category = '';

    switch (type) {
      case 'FOCUS_LOSS':
        session.focusLossCount++;
        currentCount = session.focusLossCount;
        maxCount = this.LIMITS.FOCUS_LOSS;
        category = 'focusLossCount';
        break;
      case 'MULTIPLE_PERSON':
        session.multiplePersonCount++;
        currentCount = session.multiplePersonCount;
        maxCount = this.LIMITS.MULTIPLE_PERSON;
        category = 'multiplePersonCount';
        break;
      case 'TAB_SWITCH':
        session.tabSwitchCount++;
        currentCount = session.tabSwitchCount;
        maxCount = this.LIMITS.TAB_SWITCH;
        category = 'tabSwitchCount';
        break;
      case 'NO_FACE':
        session.faceMissingCount++;
        currentCount = session.faceMissingCount;
        maxCount = this.LIMITS.FACE_MISSING;
        category = 'faceMissingCount';
        break;
      default:
        // Miscellaneous violations (e.g. right-click, devtools) - we don't auto-terminate on these by default, just warn
        break;
    }

    // Update status to Warning if counts > 0
    if (currentCount > 0 && currentCount < maxCount) {
      session.status = '🟡 Warning';
    }

    // Prepare async violation log to Google Sheets
    const violationLog = {
      assessmentId: session.examId,
      employeeId: userId,
      employeeName: session.employeeName,
      type: type,
      description: description,
      severity: currentCount >= maxCount ? 'critical' : 'medium',
      count: currentCount,
      timestamp: new Date().toISOString()
    };

    // If we have a screenshot, we only store a stub or tiny thumbnail due to Sheets limits (unless uploaded elsewhere)
    if (screenshotBase64 && screenshotBase64.length > 50000) {
      // Too large for Sheets
      violationLog.screenshot = "Image too large for sheets"; 
    } else {
      violationLog.screenshot = screenshotBase64 || '';
    }

    // Fire and forget to Google Sheets (using 'logViolation' App Script action)
    querySheets('logViolation', violationLog).catch(err => console.error('[ProctorService] Google Sheets logViolation failed:', err.message));

    // Determine return action
    if (category && currentCount >= maxCount) {
      session.status = '🔴 Exam Terminated';
      return { 
        action: 'terminate', 
        reason: `Excessive ${type.replace('_', ' ')} detected.` 
      };
    } else if (category) {
      return { 
        action: 'warn', 
        message: description, 
        currentCount, 
        maxCount 
      };
    }

    return { action: 'logged' };
  }
}

module.exports = new ProctorService();
