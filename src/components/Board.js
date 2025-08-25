import React, { useState } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import Column from './Column';
import TaskModal from './TaskModal';
import useKanban from '../hooks/useKanban';
import SidePanel from './SidePanel';

const logs = [
  { title: 'File Changed', details: 'package-lock.json updated', time: '2 min ago' },
  { title: 'Branch Created', details: 'feature/new-ui', time: '10 min ago' },
];

const Board = ({ theme, toggleTheme }) => {
  const { 
    data, 
    addTask, 
    updateTask, 
    deleteTask,
    moveTask, 
    moveCardToNextColumn, 
    completeTask,
    startFileProcessing,
    getFileProcessingStatus
  } = useKanban();
  
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;
    moveTask(source, destination);
  };

  const handleAddTask = () => {
    setEditingTask(null);
    setShowModal(true);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setShowModal(true);
  };

  const handleSaveTask = async (taskData) => {
    if (editingTask) {
      updateTask(editingTask.id, taskData);
    } else {
      const newTask = addTask(taskData);
      // If files are attached, automatically process them
      if (taskData.files && taskData.files.length > 0) {
        try {
          await startFileProcessing(newTask.id);
        } catch (error) {
          console.error('Auto file processing failed:', error);
        }
      }
    }
    setShowModal(false);
    setEditingTask(null);
  };

  const handleProcessFiles = async (taskId) => {
    try {
      await startFileProcessing(taskId);
    } catch (error) {
      console.error('File processing failed:', error);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTask(null);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f6f6f6' }}>
      <div style={{ flex: 1 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.5rem 1rem 0 1rem'
        }}>
          <h1 style={{ fontWeight: 700, fontSize: '2rem', margin: 0 }}>Kanban Board</h1>
          <button
            style={{
              padding: '10px 22px',
              background: '#009688',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              fontSize: '1rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
            }}
            onClick={handleAddTask}
            className="add-task-btn"
          >
            + Add Task
          </button>
          <button onClick={toggleTheme} className="theme-toggle-btn">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
        {/* Kanban Board */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="kanban-board" style={{ display: 'flex', gap: '20px', padding: '30px' }}>
            {data.columnOrder.map(columnId => (
              <Column
                key={columnId}
                column={data.columns[columnId]}
                cards={data.columns[columnId].cardIds.map(id => data.cards[id])}
                colId={columnId}
                onNext={moveCardToNextColumn}
                onEdit={handleEditTask}
                onDelete={deleteTask}
                onComplete={completeTask}
                onProcessWithAI={startFileProcessing}
                fileProcessingStatus={getFileProcessingStatus}
              />
            ))}
          </div>
        </DragDropContext>
        {showModal && (
          <TaskModal
            isOpen={showModal}
            onSave={handleSaveTask}
            onClose={handleCloseModal}
            task={editingTask}
            isEdit={!!editingTask}
            onProcessFiles={handleProcessFiles}
          />
        )}
      </div>
      <SidePanel logs={logs} />
    </div>
  );
};

export default Board;
