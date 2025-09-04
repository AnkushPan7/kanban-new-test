import React, { useState } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import Column from './Column';
import TaskModal from './TaskModal';
import useKanban from '../hooks/useKanban';
import SidePanel from './SidePanel';

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
      addTask(taskData);
    }
    setShowModal(false);
    setEditingTask(null);
  };


  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTask(null);
  };

  return (
    <div className="board-container">
      <div style={{ flex: 1 }}>
        <div className="board-header">
          <h1 style={{ fontWeight: 700, fontSize: '2rem', margin: 0, color: 'var(--text-color)' }}>Kanban Board</h1>
            <button
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
          <div className="kanban-board">
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
          />
        )}
      </div>
      <SidePanel />
    </div>
  );
};

export default Board;
