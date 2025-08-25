import React from 'react';
import dayjs from 'dayjs';
import { FaTrash } from 'react-icons/fa';


const Card = ({ card, onNext, onEdit, onComplete, onProcessWithAI, onDelete }) => {
  const getInitials = (name) => {
    if (!name) return '';
    return name.charAt(0).toUpperCase();
  };

  const renderFileContent = () => {
    if (!card.files || card.files.length === 0) return null;

    return (
      <div className="kanban-card-files">
        <strong>📎 Files:</strong>
        <div className="file-list">
          {card.files.map((file, index) => {
            // Check if this file has been modified
            const isModified = card.fileProcessingResults?.processedFiles?.some(
              pf => pf.fileName === file.name && pf.success
            );
            
            return (
              <div key={index} className={`file-item ${isModified ? 'modified' : ''}`}>
                <span className="file-name-small" title={file.name}>
                  {file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name}
                </span>
                {isModified && (
                  <span className="file-status-badge">✅ Modified</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFileProcessingStatus = () => {
    if (!card.fileProcessingResults) return null;

    const { success, processedFiles, error, taskCompleted } = card.fileProcessingResults;
    
    if (error) {
      return (
        <div className="file-processing-status error">
          <span className="status-icon">❌</span>
          <span className="status-text">Processing Failed: {error}</span>
        </div>
      );
    }

    if (success && processedFiles) {
      return (
        <div className="file-processing-status success">
          <span className="status-icon">✅</span>
          <span className="status-text">
            Files Processed: {processedFiles.filter(f => f.success).length}/{processedFiles.length}
          </span>
          {taskCompleted && (
            <div className="task-completed-notice">
              <span className="completion-badge">🎉 Task Auto-Completed!</span>
            </div>
          )}
          {processedFiles.map((file, index) => (
            <div key={index} className="processed-file-info">
              <small>
                📄 {file.fileName}: {file.processingDetails?.join(', ') || 'Processed'}
              </small>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  const renderGitHubStatus = () => {
    if (!card.githubUrl) return null;

    return (
      <div className="github-integration">
        <div className="github-url">
          <span className="github-icon">🔗</span>
          <a href={card.githubUrl} target="_blank" rel="noopener noreferrer" className="github-link">
            GitHub Repository
          </a>
        </div>
        
        {card.githubProcessing && (
          <div className="github-status processing">
            <span className="status-icon">⏳</span>
            <span className="status-text">Processing GitHub integration...</span>
          </div>
        )}
        
        {card.githubStatus === 'completed' && (
          <div className="github-status success">
            <span className="status-icon">✅</span>
            <span className="status-text">GitHub integration completed!</span>
            {card.pullRequestUrl && (
              <div className="github-pr">
                <a href={card.pullRequestUrl} target="_blank" rel="noopener noreferrer" className="pr-link">
                  📋 View Pull Request
                </a>
              </div>
            )}
            {card.changesApplied && (
              <div className="github-changes">
                <small>Changes applied: {card.changesApplied} files</small>
              </div>
            )}
          </div>
        )}
        
        {card.githubStatus === 'error' && (
          <div className="github-status error">
            <span className="status-icon">❌</span>
            <span className="status-text">GitHub integration failed</span>
            {card.githubError && (
              <div className="github-error">
                <small>{card.githubError}</small>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Remove the manual AI processing button since it happens automatically
  // const renderAIProcessingButton = () => { ... } - REMOVED

  return (
    <div className={`kanban-card priority-${card.priority.toLowerCase()}`}>
      <div className="kanban-card-header">
        <div className="kanban-card-avatar">
          {getInitials(card.title)}
        </div>
        <div className="kanban-card-title">
          <h3>{card.title}</h3>
          <p className="kanban-card-date">
            {dayjs(card.dueDate).format('MMM D, YYYY')}
          </p>
        </div>
      </div>
      <div className="kanban-card-info">
        <div className="kanban-card-tags">
          {card.tags && card.tags.map(tag => (
            <span key={tag} className="kanban-card-tag">{tag}</span>
          ))}
        </div>
        {card.suggestion && (
          <p><strong>Suggestion:</strong> {card.suggestion}</p>
        )}
        {card.aiProgression && (
          <div className="ai-progression-indicator">
            <span className="ai-badge">🤖 AI </span>
            <span className="progression-text">
              {card.aiProgression === 'ai-auto-moved-to-inprogress' && 'Auto-moved to In Progress'}
              {card.aiProgression.includes('ai-auto-completed-to-done') && 'Auto-completed to Done'}
              {card.aiProgression.includes('ai-moved-from') && 'Moved Between Columns'}
              {!card.aiProgression.includes('ai-auto-moved-to-inprogress') && 
               !card.aiProgression.includes('ai-auto-completed-to-done') && 
               !card.aiProgression.includes('ai-moved-from') && 
               card.aiProgression}
            </span>
          </div>
        )}
        {card.completed && (
          <div className="completion-status">
            <span className="completion-badge completed">✅ Completed</span>
            {card.completedAt && (
              <span className="completion-time">
                at {new Date(card.completedAt).toLocaleString()}
              </span>
            )}
          </div>
        )}
        {card.lastAIAnalysis && (
          <div className="ai-analysis-time">
            <small>🤖 Last AI Analysis: {new Date(card.lastAIAnalysis).toLocaleString()}</small>
          </div>
        )}
        {renderFileContent()}
        {renderFileProcessingStatus()}
        {renderGitHubStatus()}
      </div>
      <div className="kanban-card-footer">
        <div className="kanban-card-priority">
          <span>{card.priority}</span>
        </div>
        <div className="kanban-card-icons">
          <input
            type="checkbox"
            checked={card.completed || false}
            onChange={() => onComplete(card.id)}
            title="Mark as completed"
            style={{ marginRight: '8px', cursor: 'pointer' }}
          />
          <span onClick={onEdit} style={{ cursor: 'pointer', marginRight: '8px' }}>&#9998;</span>
          <FaTrash onClick={() => onDelete(card.id)} style={{ cursor: 'pointer', color: 'red' }} />
        </div>
      </div>
    </div>
  );
};

export default Card;
