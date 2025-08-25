import React from 'react';

const SidePanel = ({ logs, selectedFile }) => {
  return (
    <div className="side-panel">
      <h3 className="side-panel-title">Activity Log</h3>
      <div className="side-panel-content">
        {selectedFile ? (
          <>
            <h4>Changes for {selectedFile.name}</h4>
            {logs.length === 0 && <p>No changes logged for this file.</p>}
            <div className="log-entries">
              {logs.map((log, index) => (
                <div key={index} className="log-entry">
                  <p><strong>Timestamp:</strong> {new Date(log.timestamp).toLocaleString()}</p>
                  <p><strong>Instruction:</strong> {log.description}</p>
                  <pre>{log.modifiedContent}</pre>
                </div>
              )).reverse()}{/* Show newest logs first */}
            </div>
          </>
        ) : (
          <div className="side-panel-empty">Select a file in a task to see its logs.</div>
        )}
      </div>
    </div>
  );
};

export default SidePanel;
