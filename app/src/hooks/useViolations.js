import { useEffect, useCallback } from 'react';

export function useViolations({ phase, user, assessmentId, socketRef }) {
  
  const logViolation = useCallback((type, description) => {
    // We do not maintain counts on frontend anymore. Emit immediately to backend.
    socketRef.current?.emit('violation', {
      examId: assessmentId,
      userId: user?._id,
      type: type,
      description: description,
      screenshot: null // Optionally implemented later if needed
    });
  }, [user, assessmentId, socketRef]);

  useEffect(() => {
    if (phase !== 'exam') return;

    const handleVisibility = () => {
      if (document.hidden) {
        logViolation('TAB_SWITCH', 'Candidate switched tabs or minimized the browser.');
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && phase === 'exam') {
        logViolation('TAB_SWITCH', 'Candidate exited fullscreen mode.');
      }
    };

    const handleBlur = () => logViolation('TAB_SWITCH', 'Window lost focus.');
    
    const handleContextMenu = (e) => { 
      e.preventDefault(); 
      logViolation('RIGHT_CLICK', 'Right-click attempted.'); 
    };
    
    const handleKeyDown = (e) => {
      if ((e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'u' || e.key === 'a')) ||
        (e.key === 'F12') ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.altKey && e.key === 'Tab') ||
        (e.key === 'PrintScreen')) {
        e.preventDefault();
        logViolation('DEVTOOLS', `Blocked keyboard shortcut: ${e.key}`);
      }
    };
    
    const handleCopy = (e) => { e.preventDefault(); logViolation('COPY_PASTE', 'Copy attempted.'); };
    const handlePaste = (e) => { e.preventDefault(); logViolation('COPY_PASTE', 'Paste attempted.'); };

    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
    };
  }, [phase, logViolation]);

  return { logViolation };
}
