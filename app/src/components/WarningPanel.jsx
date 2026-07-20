import React, { useEffect, useState } from 'react';
import './WarningPanel.css';

export default function WarningPanel({ socketRef, onTerminate }) {
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    if (!socketRef.current) return;

    const handleWarning = (data) => {
      // data: { message, currentCount, maxCount, type }
      setWarning(data);

      // Auto-hide warning after 6 seconds
      setTimeout(() => {
        setWarning((prev) => {
          if (prev && prev.message === data.message) return null;
          return prev;
        });
      }, 6000);
    };

    const handleForceTerminate = (data) => {
      onTerminate(data.reason || 'Terminated by Admin');
    };

    const handleAdminCommand = (data) => {
      // Possible actions: refresh, reconnect-webcam, etc.
      if (data.action === 'force-refresh') {
        window.location.reload();
      }
    };

    socketRef.current.on('violation-warning', handleWarning);
    socketRef.current.on('force-terminate', handleForceTerminate);
    socketRef.current.on('admin-command', handleAdminCommand);

    return () => {
      socketRef.current.off('violation-warning', handleWarning);
      socketRef.current.off('force-terminate', handleForceTerminate);
      socketRef.current.off('admin-command', handleAdminCommand);
    };
  }, [socketRef, onTerminate]);

  if (!warning) return null;

  return (
    <div className="warning-panel-overlay">
      <div className="warning-panel-card">
        <div className="warning-icon">⚠️</div>
        <div className="warning-content">
          <h3>Warning {warning.currentCount} of {warning.maxCount}</h3>
          <p>{warning.message}</p>
          <div className="warning-subtext">
            Next violation may terminate your exam.
          </div>
        </div>
      </div>
    </div>
  );
}
