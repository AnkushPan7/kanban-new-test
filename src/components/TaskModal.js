import React, { useState, useEffect } from 'react';
import '../App.css';

const TaskModal = ({ isOpen, onClose, onSave, task, isEdit }) => {
  const [title, setTitle] = useState(task ? task.title : '');
  const [description, setDescription] = useState(task ? task.description : '');
  const [priority, setPriority] = useState(task ? task.priority : '');
  const [tags, setTags] = useState(task ? task.tags ? task.tags.join(', ') : '' : '');
  const [githubUrl, setGithubUrl] = useState(task ? task.githubUrl || '' : '');
  
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setPriority(task.priority || '');
      setTags(task.tags ? task.tags.join(', ') : '');
      setGithubUrl(task.githubUrl || '');
      
    } else {
      setTitle('');
      setDescription('');
      setPriority('');
      setTags('');
      setGithubUrl('');
      
    }
    setIsProcessing(false);
    setProcessingStatus('');
  }, [task, isOpen]);


  const handleSave = async () => {
    if (!title || !description || !priority) {
      setError('Title, description, and priority are required.');
      return;
    }

    const taskData = {
      title,
      description,
      priority,
      tags: tags.split(',').map(tag => tag.trim()),
      githubUrl: githubUrl.trim(),
      
    };

    onSave(taskData);
    onClose();
  };

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{isEdit ? 'Edit Task' : 'New Task'}</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        
        {/* Processing Status */}
        {isProcessing && (
          <div className="processing-status">
            <div className="processing-spinner">🔄</div>
            <p className="processing-text">{processingStatus}</p>
          </div>
        )}
        
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <input
            type="text"
            placeholder="Task Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="Task Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          ></textarea>
          <select value={priority || ''} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Select Priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          
          <input
            type="text"
            placeholder="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          
          <input
            type="url"
            placeholder="GitHub Repository URL"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
          />
          <div className="modal-actions">
            <button type="submit" className="btn-primary">{isEdit ? 'Update' : 'Add Task'}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;