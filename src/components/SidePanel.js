import React, { useState, useEffect } from 'react';

const SidePanel = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchActivities();
    // Refresh activities every 30 seconds
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/api/activity');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setActivities(data.activities || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
      setError('Failed to load activity data');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now - time) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  return (
    <div className="side-panel">
      <h3 className="side-panel-title">Activity Log</h3>
      <div className="side-panel-content">
        {loading ? (
          <div className="side-panel-loading">Loading activities...</div>
        ) : error ? (
          <div className="side-panel-error">{error}</div>
        ) : activities.length === 0 ? (
          <div className="side-panel-empty">No activities yet.</div>
        ) : (
          <div className="activity-list">
            {activities.map((activity) => (
              <div key={activity.id} className="activity-entry">
                <div className="activity-header">
                  <div className="activity-task">
                    {activity.taskDescription}
                  </div>
                  <div className="activity-time">
                    {formatTimeAgo(activity.timestamp)}
                  </div>
                </div>
                <div className="activity-details">
                  <div className="activity-repo">
                    📁 {activity.repository}
                  </div>
                  <div className="activity-changes">
                    {activity.filesChanged > 0 ? (
                      <>
                        <span className="files-count">
                          📝 {activity.filesChanged} file{activity.filesChanged !== 1 ? 's' : ''} changed
                        </span>
                        {activity.totalLinesAdded > 0 || activity.totalLinesRemoved > 0 ? (
                          <span className="lines-count">
                            {activity.totalLinesAdded > 0 && <span className="lines-added">+{activity.totalLinesAdded}</span>}
                            {activity.totalLinesRemoved > 0 && <span className="lines-removed">-{activity.totalLinesRemoved}</span>}
                          </span>
                        ) : null}
                        {activity.changedFiles && (
                          <div className="changed-files">
                            {activity.changedFiles}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="no-changes">No files modified</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={fetchActivities} className="refresh-btn" disabled={loading}>
          {loading ? '⟳' : '↻'} Refresh
        </button>
      </div>
    </div>
  );
};

export default SidePanel;
