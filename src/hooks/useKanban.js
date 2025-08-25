import { useState, useEffect } from 'react';
import { getTasks, getColumns, createTask as createTaskApi, updateTask as updateTaskApi, deleteTask as deleteTaskApi } from '../services/apiService';
import aiAgent from '../services/aiService';
import githubWorkflowService from '../services/githubWorkflowService';

const useKanban = () => {
  const [data, setData] = useState({ columnOrder: [], columns: {}, cards: {} });
  const [loading, setLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState(null);
  const AUTO_MOVE_DELAY_MS = 3000;
  const AI_ANALYSIS_INTERVAL = 10000; // 10 seconds
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasks, columns] = await Promise.all([getTasks(), getColumns()]);
        
        const cards = tasks.reduce((acc, task) => {
          acc[task.id] = { ...task, id: task.id };
          return acc;
        }, {});

        const columnData = columns.reduce((acc, column) => {
          acc[column.id] = { ...column, cardIds: [] };
          return acc;
        }, {});

        tasks.forEach(task => {
          if (columnData[task.status]) {
            columnData[task.status].cardIds.push(task.id);
          }
        });

        const columnOrder = columns.map(col => col.id);

        setData({
          cards,
          columns: columnData,
          columnOrder,
        });
      } catch (error) {
        console.error("Error fetching initial data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // AI-powered task progression logic using AI Agent
  const analyzeTaskProgress = (task, currentColumn) => {
    const analysis = aiAgent.analyzeTask(task, currentColumn, data);
    
    if (analysis.recommendation && analysis.recommendation.action === 'move') {
      return analysis.recommendation.targetColumn;
    }
    
    return currentColumn; // Stay in current column
  };

  // AI-powered automatic progression
  const processAITaskProgression = () => {
    setData(prevData => {
      let hasChanges = false;
      const newColumns = { ...prevData.columns };
      const updatedCards = { ...prevData.cards };

      // Analyze all tasks in each column
      Object.entries(newColumns).forEach(([columnId, column]) => {
        column.cardIds.forEach(cardId => {
          const task = prevData.cards[cardId];
          if (!task) return;

          const aiDecision = analyzeTaskProgress(task, columnId);
          
          if (aiDecision !== columnId) {
            hasChanges = true;
            
            // Remove from current column
            newColumns[columnId] = {
              ...newColumns[columnId],
              cardIds: newColumns[columnId].cardIds.filter(id => id !== cardId)
            };
            
            // Add to target column
            newColumns[aiDecision] = {
              ...newColumns[aiDecision],
              cardIds: [...newColumns[aiDecision].cardIds, cardId]
            };

            // Update task with AI progression data
            updatedCards[cardId] = {
              ...task,
              aiProgression: `ai-moved-from-${columnId}-to-${aiDecision}`,
              lastActivity: new Date().toISOString(),
              lastAIAnalysis: new Date().toISOString()
            };
          }
        });
      });

      return hasChanges ? { ...prevData, columns: newColumns, cards: updatedCards } : prevData;
    });
  };

  // Update AI insights periodically
  useEffect(() => {
    if (loading) return;

    const updateInsights = () => {
      const insights = aiAgent.getBoardInsights(data);
      setAiInsights(insights);
    };

    // Initial insights
    updateInsights();

    // Set up periodic AI analysis
    const aiInterval = setInterval(() => {
      processAITaskProgression();
      updateInsights();
    }, AI_ANALYSIS_INTERVAL);

    return () => clearInterval(aiInterval);
  }, [data, loading]);

  // Start AI file processing for a task
  const startFileProcessing = async (taskId) => {
    const task = data.cards[taskId];
    if (!task) {
      throw new Error('Task not found');
    }

    try {
      const results = await aiAgent.startFileProcessing(task);
      
      // Update task with processing results
      setData(prevData => {
        const updatedCards = { ...prevData.cards };
        const updatedTask = { ...task };
        
        // Update file references with modified content
        if (results.processedFiles) {
          updatedTask.files = updatedTask.files.map(file => {
            const modifiedFile = aiAgent.getModifiedFileContent(file.name);
            return modifiedFile || file;
          });
        }
        
        // Update task with processing results
        updatedTask.fileProcessingResults = results;
        updatedTask.lastFileProcessing = new Date().toISOString();
        
        // If task was completed by AI, mark it as done
        if (results.taskCompleted) {
          updatedTask.completed = true;
          updatedTask.completedAt = new Date().toISOString();
          updatedTask.aiProgression = 'ai-auto-completed-to-done';
          
          // Move task to done column
          const newColumns = { ...prevData.columns };
          
          // Remove from current column
          Object.keys(newColumns).forEach(columnId => {
            if (newColumns[columnId].cardIds.includes(taskId)) {
              newColumns[columnId] = {
                ...newColumns[columnId],
                cardIds: newColumns[columnId].cardIds.filter(id => id !== taskId)
              };
            }
          });
          
          // Add to done column
          newColumns.done = {
            ...newColumns.done,
            cardIds: [...newColumns.done.cardIds, taskId]
          };
          
          return {
            ...prevData,
            columns: newColumns,
            cards: {
              ...updatedCards,
              [taskId]: updatedTask
            }
          };
        }
        
        return {
          ...prevData,
          cards: {
            ...updatedCards,
            [taskId]: updatedTask
          }
        };
      });

      return results;
    } catch (error) {
      console.error('File processing error:', error);
      throw error;
    }
  };

  // Get file processing status for a task
  const getFileProcessingStatus = (taskId) => {
    return aiAgent.getFileProcessingStatus(taskId);
  };

  // Enhanced addTask with file processing capability
  const addTask = async (taskData) => {
    try {
      const newTask = await createTaskApi(taskData);
      setData((prevData) => {
        const newCards = { ...prevData.cards, [newTask.id]: newTask };
        const newColumns = { ...prevData.columns };
        newColumns[newTask.status].cardIds.push(newTask.id);

        return {
          ...prevData,
          cards: newCards,
          columns: newColumns,
        };
      });
    } catch (error) {
      console.error("Error creating task:", error);
    }
  };

  const updateTask = async (cardId, taskData) => {
    try {
      const updatedTask = await updateTaskApi(cardId, taskData);
      setData((prevData) => ({
        ...prevData,
        cards: {
          ...prevData.cards,
          [cardId]: updatedTask,
        },
      }));
    } catch (error) {
      console.error("Error updating task:", error);
    }
  };

  const deleteTask = async (cardId) => {
    try {
      await deleteTaskApi(cardId);
      setData((prevData) => {
        const newCards = { ...prevData.cards };
        delete newCards[cardId];

        const newColumns = { ...prevData.columns };
        Object.keys(newColumns).forEach(columnId => {
          newColumns[columnId].cardIds = newColumns[columnId].cardIds.filter(id => id !== cardId);
        });

        return {
          ...prevData,
          cards: newCards,
          columns: newColumns,
        };
      });
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const moveTask = async (source, destination) => {
    const { droppableId: sourceId, index: sourceIndex } = source;
    const { droppableId: destinationId, index: destinationIndex } = destination;

    const startCol = data.columns[sourceId];
    const endCol = data.columns[destinationId];

    const newStartCardIds = [...startCol.cardIds];
    const [movedCardId] = newStartCardIds.splice(sourceIndex, 1);

    if (sourceId === destinationId) {
      newStartCardIds.splice(destinationIndex, 0, movedCardId);
      const newCol = { ...startCol, cardIds: newStartCardIds };
      setData((prevData) => ({
        ...prevData,
        columns: {
          ...prevData.columns,
          [newCol.id]: newCol,
        },
      }));
    } else {
      const newEndCardIds = [...endCol.cardIds];
      newEndCardIds.splice(destinationIndex, 0, movedCardId);
      
      const task = data.cards[movedCardId];
      
      // Update task with movement tracking
      const updatedCards = {
        ...data.cards,
        [movedCardId]: {
          ...task,
          lastActivity: new Date().toISOString(),
          lastMove: { from: sourceId, to: destinationId, timestamp: new Date().toISOString() }
        }
      };

      // Check if task is moving to "done" and has GitHub URL
      if (destinationId === 'done' && task.githubUrl) {
        try {
          // Mark task as processing GitHub integration
          updatedCards[movedCardId] = {
            ...updatedCards[movedCardId],
            githubProcessing: true,
            githubStatus: 'processing'
          };
          
          // Apply task to GitHub repository
          const result = await githubWorkflowService.applyTaskToGitHub(task);
          
          // Update task with GitHub integration results
          updatedCards[movedCardId] = {
            ...updatedCards[movedCardId],
            githubProcessing: false,
            githubStatus: 'completed',
            githubResult: result,
            pullRequestUrl: result.pullRequestUrl,
            branchName: result.branchName,
            changesApplied: result.changesApplied
          };
          
          console.log('GitHub integration completed:', result);
          
        } catch (error) {
          console.error('GitHub integration failed:', error);
          
          // Update task with error status
          updatedCards[movedCardId] = {
            ...updatedCards[movedCardId],
            githubProcessing: false,
            githubStatus: 'error',
            githubError: error.message
          };
        }
      }

      setData((prevData) => ({
        ...prevData,
        cards: updatedCards,
        columns: {
          ...prevData.columns,
          [startCol.id]: { ...startCol, cardIds: newStartCardIds },
          [endCol.id]: { ...endCol, cardIds: newEndCardIds },
        },
      }));
    }
  };

  const moveCardToNextColumn = (cardId) => {
    setData(prevData => {
      const currentColId = Object.keys(prevData.columns).find(colId =>
        prevData.columns[colId].cardIds.includes(cardId)
      );
      const currentIndex = prevData.columnOrder.indexOf(currentColId);
      if (currentIndex === -1 || currentIndex === prevData.columnOrder.length - 1) return prevData;
      const nextColId = prevData.columnOrder[currentIndex + 1];

      // Remove from current, add to next
      const newColumns = { ...prevData.columns };
      newColumns[currentColId] = {
        ...newColumns[currentColId],
        cardIds: newColumns[currentColId].cardIds.filter(id => id !== cardId)
      };
      newColumns[nextColId] = {
        ...newColumns[nextColId],
        cardIds: [...newColumns[nextColId].cardIds, cardId]
      };

      return { ...prevData, columns: newColumns };
    });
  };

  const completeTask = (cardId) => {
    setData(prevData => {
      const currentTask = prevData.cards[cardId];
      const isCurrentlyCompleted = currentTask.completed || false;
      const newCompletedStatus = !isCurrentlyCompleted;

      // Find which column the task is currently in
      const currentColId = Object.keys(prevData.columns).find(colId =>
        prevData.columns[colId].cardIds.includes(cardId)
      );

      // If completing the task and it's not already in Done column
      if (newCompletedStatus && currentColId && currentColId !== 'done') {
        const newColumns = { ...prevData.columns };
        
        // Remove from current column
        newColumns[currentColId] = {
          ...newColumns[currentColId],
          cardIds: newColumns[currentColId].cardIds.filter(id => id !== cardId)
        };
        
        // Add to Done column
        newColumns.done = {
          ...newColumns.done,
          cardIds: [...newColumns.done.cardIds, cardId]
        };

        // Update the task with completion data
        const updatedCards = {
          ...prevData.cards,
          [cardId]: {
            ...currentTask,
            completed: newCompletedStatus,
            lastActivity: new Date().toISOString(),
            aiProgression: `ai-auto-completed-to-done-from-${currentColId}`,
            completedAt: new Date().toISOString(),
            previousColumn: currentColId,
            lastAIAnalysis: new Date().toISOString()
          }
        };

        return {
          ...prevData,
          cards: updatedCards,
          columns: newColumns
        };
      } 
      // If uncompleting the task
      else if (!newCompletedStatus) {
        const updatedCards = {
          ...prevData.cards,
          [cardId]: {
            ...currentTask,
            completed: newCompletedStatus,
            lastActivity: new Date().toISOString(),
            aiProgression: undefined,
            completedAt: undefined,
            previousColumn: undefined
          }
        };

        return {
          ...prevData,
          cards: updatedCards
        };
      }
      // If already in Done column, just update completion status
      else {
        const updatedCards = {
          ...prevData.cards,
          [cardId]: {
            ...currentTask,
            completed: newCompletedStatus,
            lastActivity: new Date().toISOString()
          }
        };

        return {
          ...prevData,
          cards: updatedCards
        };
      }
    });
  };

  // Get AI agent status
  const getAIStatus = () => {
    return aiAgent.getStatus();
  };

  // Force AI analysis
  const forceAIAnalysis = () => {
    processAITaskProgression();
    const insights = aiAgent.getBoardInsights(data);
    setAiInsights(insights);
  };

  // Get GitHub processing status for a task
  const getGitHubProcessingStatus = (taskId) => {
    return githubWorkflowService.getProcessingStatus(taskId);
  };

  return {
    data,
    aiInsights,
    addTask,
    updateTask,
    deleteTask,
    moveTask,
    moveCardToNextColumn,
    completeTask,
    getAIStatus,
    forceAIAnalysis,
    startFileProcessing,
    getFileProcessingStatus,
    getGitHubProcessingStatus,
  };
};

export default useKanban;