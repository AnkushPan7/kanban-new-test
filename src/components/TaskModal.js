import React, { useState, useEffect } from 'react';
import '../App.css';

const TaskModal = ({ isOpen, onClose, onSave, task, isEdit, onProcessFiles }) => {
  const [title, setTitle] = useState(task ? task.title : '');
  const [description, setDescription] = useState(task ? task.description : '');
  const [priority, setPriority] = useState(task ? task.priority : '');
  const [tags, setTags] = useState(task ? task.tags ? task.tags.join(', ') : '' : '');
  const [selectedFiles, setSelectedFiles] = useState(task ? task.files || [] : []);
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
      setSelectedFiles(task.files || []);
      setGithubUrl(task.githubUrl || '');
      
    } else {
      setTitle('');
      setDescription('');
      setPriority('');
      setTags('');
      setSelectedFiles([]);
      setGithubUrl('');
      
    }
    setIsProcessing(false);
    setProcessingStatus('');
  }, [task, isOpen]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

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
      files: selectedFiles,
      githubUrl: githubUrl.trim(),
      
    };

    // If files are attached, automatically process them with AI
    if (selectedFiles.length > 0 && onProcessFiles) {
      setIsProcessing(true);
      setProcessingStatus('🤖 AI is processing your files...');
      
      try {
        // Save the task first
        onSave(taskData);
        
        // Then process files automatically
        setProcessingStatus('📁 Files saved, processing with AI...');
        
        // Simulate AI processing (in real app, this would call the AI service)
        setTimeout(() => {
          setProcessingStatus('✅ Files processed successfully! Task will be completed automatically.');
          setTimeout(() => {
            onClose();
          }, 2000);
        }, 3000);
        
      } catch (error) {
        setProcessingStatus('❌ Error processing files: ' + error.message);
        setIsProcessing(false);
      }
    } else {
      // No files, just save normally
      onSave(taskData);
      onClose();
    }
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
            placeholder="GitHub Repository URL (optional)"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
          />
          
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="file-upload-label">
              📎 Attach Files
            </label>
            <input
              id="file-upload"
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {selectedFiles.length > 0 && (
              <div className="selected-files">
                <h4>Selected Files:</h4>
                {selectedFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <span className="file-name">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="remove-file-btn"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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