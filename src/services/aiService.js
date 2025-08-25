// AI Agent Service for Kanban Board
class AIAgent {
  constructor() {
    this.name = "KanbanAI";
    this.version = "1.0.0";
    this.learningData = new Map();
    this.fileProcessingQueue = new Map(); // Track file processing tasks
    this.modifiedFiles = new Map(); // Store modified file content for later use
  }

  // Process file-based tasks with direct file modification
  async processFileTask(task) {
    if (!task.files || task.files.length === 0) {
      return {
        success: false,
        processedFiles: []
      };
    }

    const results = [];
    
    for (const file of task.files) {
      try {
        const result = await this.processSingleFile(file, task.description);
        results.push(result);
        
        // If processing was successful, modify the original file directly
        if (result.success && result.modifiedContent) {
          await this.modifyOriginalFile(file, result.modifiedContent);
        }
      } catch (error) {
        results.push({
          fileName: file.name,
          success: false,
          error: error.message,
          processedFiles: []
        });
      }
    }

    // If any files were processed successfully, mark task as completed
    const hasSuccessfulProcessing = results.some(r => r.success);
    if (hasSuccessfulProcessing) {
      // Mark task as completed automatically
      this.markTaskAsCompleted(task.id);
    }

    return {
      success: hasSuccessfulProcessing,
      processedFiles: results,
      timestamp: new Date().toISOString(),
      taskCompleted: hasSuccessfulProcessing
    };
  }

  // Process a single file with AI
  async processSingleFile(file, taskDescription) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const fileContent = event.target.result;
          const fileType = this.detectFileType(file.name, fileContent);
          
          // Process based on file type
          let modifiedContent;
          let processingDetails;
          
          if (fileType === 'text' || fileType === 'code') {
            const result = await this.processTextFile(fileContent, taskDescription);
            modifiedContent = result.content;
            processingDetails = result.details;
          } else if (fileType === 'image') {
            const result = await this.processImageFile(file, taskDescription);
            modifiedContent = result.content;
            processingDetails = result.details;
          } else {
            throw new Error(`Unsupported file type: ${fileType}`);
          }

          resolve({
            fileName: file.name,
            success: true,
            originalContent: fileContent,
            modifiedContent: modifiedContent,
            processingDetails: processingDetails,
            fileType: fileType
          });

        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // Detect file type based on extension and content
  detectFileType(fileName, content) {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    // Code files
    if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'xml', 'sql'].includes(extension)) {
      return 'code';
    }
    
    // Text files
    if (['txt', 'md', 'log', 'csv'].includes(extension)) {
      return 'text';
    }
    
    // Image files
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(extension)) {
      return 'image';
    }
    
    // Default to text for unknown types
    return 'text';
  }

  // Process text/code files with AI
  async processTextFile(content, taskDescription) {
    // Simulate AI processing based on task description
    const processingDetails = [];
    let modifiedContent = content;

    // Example AI processing logic
    if (taskDescription.toLowerCase().includes('equation') || taskDescription.toLowerCase().includes('solve')) {
      // Process mathematical equations
      modifiedContent = this.processEquations(content, taskDescription);
      processingDetails.push('AI processed mathematical equations');
    }
    
    if (taskDescription.toLowerCase().includes('format') || taskDescription.toLowerCase().includes('clean')) {
      // Format and clean content
      modifiedContent = this.formatContent(content);
      processingDetails.push('AI formatted and cleaned content');
    }
    
    if (taskDescription.toLowerCase().includes('optimize') || taskDescription.toLowerCase().includes('improve')) {
      // Optimize content
      modifiedContent = this.optimizeContent(content);
      processingDetails.push('AI optimized content');
    }

    return {
      content: modifiedContent,
      details: processingDetails
    };
  }

  // Process mathematical equations
  processEquations(content, taskDescription) {
    let modifiedContent = content;
    
    // Example: Solve simple equations
    if (taskDescription.toLowerCase().includes('solve')) {
      // Find and solve equations like "2x + 3 = 7"
      modifiedContent = content.replace(/(\d+)x\s*\+\s*(\d+)\s*=\s*(\d+)/g, (match, a, b, c) => {
        const x = (parseInt(c) - parseInt(b)) / parseInt(a);
        return `${match} → x = ${x}`;
      });
    }
    
    // Example: Calculate expressions
    if (taskDescription.toLowerCase().includes('calculate')) {
      modifiedContent = content.replace(/(\d+)\s*\+\s*(\d+)/g, (match, a, b) => {
        return `${match} = ${parseInt(a) + parseInt(b)}`;
      });
    }
    
    return modifiedContent;
  }

  // Format and clean content
  formatContent(content) {
    let formatted = content;
    
    // Remove extra whitespace
    formatted = formatted.replace(/\s+/g, ' ');
    
    // Fix common formatting issues
    formatted = formatted.replace(/\s*([.,;:!?])\s*/g, '$1 ');
    
    // Add proper line breaks
    formatted = formatted.replace(/\. /g, '.\n');
    
    return formatted;
  }

  // Optimize content
  optimizeContent(content) {
    let optimized = content;
    
    // Remove redundant words
    optimized = optimized.replace(/\b(the\s+the\b)/gi, 'the');
    optimized = optimized.replace(/\b(is\s+is\b)/gi, 'is');
    
    // Improve readability
    optimized = optimized.replace(/\b(very\s+)/gi, '');
    optimized = optimized.replace(/\b(really\s+)/gi, '');
    
    return optimized;
  }

  // Process image files (placeholder for future implementation)
  async processImageFile(file, taskDescription) {
    // This would integrate with image processing AI services
    // For now, return the original file
    return {
      content: file,
      details: ['Image processing not yet implemented']
    };
  }

  // Modify original file by creating a new File object with modified content
  async modifyOriginalFile(originalFile, modifiedContent) {
    try {
      // Create a new file with modified content
      const modifiedFile = new File([modifiedContent], originalFile.name, {
        type: originalFile.type,
        lastModified: Date.now()
      });

      // In a real application, you would:
      // 1. Upload to server
      // 2. Replace original file
      // 3. Update file system
      
      // For now, we'll simulate saving by creating a download link
      // this.createDownloadLink(modifiedFile, originalFile.name); // Removed as per new_code
      
      return {
        success: true,
        fileName: originalFile.name,
        message: 'File processed and ready for download'
      };
    } catch (error) {
      return {
        success: false,
        fileName: originalFile.name,
        error: error.message
      };
    }
  }

  // Enhanced file processing with direct modification
  async processFileWithDirectModification(file, taskDescription) {
    try {
      // Read the file content
      const fileContent = await this.readFileContent(file);
      const fileType = this.detectFileType(file.name, fileContent);
      
      // Process based on file type
      let modifiedContent;
      let processingDetails;
      
      if (fileType === 'text' || fileType === 'code') {
        const result = await this.processTextFile(fileContent, taskDescription);
        modifiedContent = result.content;
        processingDetails = result.details;
      } else if (fileType === 'image') {
        const result = await this.processImageFile(file, taskDescription);
        modifiedContent = result.content;
        processingDetails = result.details;
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Create a new file with modified content
      const newFile = new File([modifiedContent], file.name, {
        type: file.type,
        lastModified: Date.now()
      });

      // Replace the original file reference
      // In a real app, this would update the file system
      this.replaceFileInTask(file, newFile);

      return {
        fileName: file.name,
        success: true,
        originalContent: fileContent,
        modifiedContent: modifiedContent,
        processingDetails: processingDetails,
        fileType: fileType,
        newFile: newFile
      };

    } catch (error) {
      throw error;
    }
  }

  // Read file content as text
  readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // Replace file in task (simulates file system update)
  replaceFileInTask(originalFile, newFile) {
    // In a real application, this would:
    // 1. Update the file system
    // 2. Replace the file reference in the task
    // 3. Trigger a re-render of the UI
    
    console.log(`File ${originalFile.name} has been modified with new content`);
    console.log('New file content preview:', newFile);
    
    // For now, we'll store the modified file for later use
    if (!this.modifiedFiles) {
      this.modifiedFiles = new Map();
    }
    this.modifiedFiles.set(originalFile.name, newFile);
  }

  // Get modified file content
  getModifiedFileContent(fileName) {
    if (this.modifiedFiles && this.modifiedFiles.has(fileName)) {
      return this.modifiedFiles.get(fileName);
    }
    return null;
  }

  // Mark task as completed in the board state
  markTaskAsCompleted(taskId) {
    // This would involve updating the boardState object in the main application
    // For now, we'll just simulate the completion
    console.log(`Simulating task completion for task ID: ${taskId}`);
    // In a real app, you'd find the task in boardState.cards and update its completedAt
    // boardState.cards[taskId].completedAt = new Date().toISOString();
    // boardState.cards[taskId].completed = true;
  }

  // Get file processing status for a task
  getFileProcessingStatus(taskId) {
    return this.fileProcessingQueue.get(taskId) || {
      status: 'not_started',
      progress: 0,
      results: null,
      error: null
    };
  }

  // Start file processing for a task
  async startFileProcessing(task) {
    if (!task.files || task.files.length === 0) {
      return {
        success: false,
        error: 'No files attached to task'
      };
    }

    // Mark task as processing
    this.fileProcessingQueue.set(task.id, {
      status: 'processing',
      progress: 0,
      results: null,
      error: null,
      startTime: new Date().toISOString()
    });

    try {
      // Process the files
      const results = await this.processFileTask(task);
      
      // Update queue with results
      this.fileProcessingQueue.set(task.id, {
        status: 'completed',
        progress: 100,
        results: results,
        error: null,
        completedTime: new Date().toISOString()
      });

      return results;
    } catch (error) {
      // Update queue with error
      this.fileProcessingQueue.set(task.id, {
        status: 'error',
        progress: 0,
        results: null,
        error: error.message,
        errorTime: new Date().toISOString()
      });

      throw error;
    }
  }

  // Analyze task and decide next action
  analyzeTask(task, currentColumn, boardState) {
    const analysis = {
      taskId: task.id,
      currentColumn,
      recommendation: null,
      confidence: 0,
      reasoning: [],
      timestamp: new Date().toISOString()
    };

    try {
      // Analyze task properties
      const taskScore = this.calculateTaskScore(task);
      const columnContext = this.analyzeColumnContext(currentColumn, boardState);
      const userBehavior = this.analyzeUserBehavior(task, boardState);

      // Decision making logic
      if (currentColumn === 'todo') {
        analysis.recommendation = this.decideTodoAction(task, taskScore, columnContext);
      } else if (currentColumn === 'inprogress') {
        analysis.recommendation = this.decideInProgressAction(task, taskScore, columnContext, userBehavior);
      } else if (currentColumn === 'done') {
        analysis.recommendation = 'stay';
      }

      // Calculate confidence based on data quality
      analysis.confidence = this.calculateConfidence(task, analysis.reasoning);
      
      // Store learning data
      this.storeLearningData(task.id, analysis);

    } catch (error) {
      console.error('AI Agent Error:', error);
      analysis.recommendation = 'stay';
      analysis.confidence = 0.1;
      analysis.reasoning.push('Error in analysis, defaulting to stay');
    }

    return analysis;
  }

  // Calculate task priority score
  calculateTaskScore(task) {
    let score = 0;
    const reasons = [];

    // Priority scoring
    const priorityScores = { 'High': 3, 'Medium': 2, 'Low': 1 };
    score += priorityScores[task.priority] || 1;
    reasons.push(`Priority: ${task.priority} (${priorityScores[task.priority] || 1} points)`);

    // Complexity scoring (inverse - simpler tasks get higher scores)
    const complexityScores = { 'High': 1, 'Medium': 2, 'Low': 3 };
    score += complexityScores[task.complexity] || 2;
    reasons.push(`Complexity: ${task.complexity} (${complexityScores[task.complexity] || 2} points)`);

    // Time-based scoring
    if (task.createdAt) {
      const ageInHours = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60);
      if (ageInHours < 1) score += 2; // New tasks get bonus
      else if (ageInHours > 24) score += 1; // Old tasks get small bonus
      reasons.push(`Age: ${ageInHours.toFixed(1)}h (${ageInHours < 1 ? 2 : ageInHours > 24 ? 1 : 0} points)`);
    }

    // Completion status
    if (task.completed) {
      score += 5; // Completed tasks get high score
      reasons.push('Completed: +5 points');
    }

    return { score, reasons };
  }

  // Analyze column context
  analyzeColumnContext(columnId, boardState) {
    const column = boardState && boardState.columns ? boardState.columns[columnId] : null;       
    const cardCount = column && column.cardIds ? column.cardIds.length : 0;
    
    return {
      cardCount,
      isOverloaded: cardCount > 5,
      isUnderloaded: cardCount < 2,
      workload: cardCount / 5 // Normalized workload (0-1+)
    };
  }

  // Analyze user behavior patterns
  analyzeUserBehavior(task, boardState) {
    const behavior = {
      hasRecentActivity: false,
      activityFrequency: 0,
      completionPattern: 'unknown'
    };

    if (task.lastActivity) {
      const timeSinceActivity = Date.now() - new Date(task.lastActivity).getTime();
      behavior.hasRecentActivity = timeSinceActivity < 300000; // 5 minutes
      behavior.activityFrequency = this.calculateActivityFrequency(task.id);
    }

    // Analyze completion patterns
    const completedTasks = Object.values(boardState.cards).filter(card => card.completed);
    if (completedTasks.length > 0) {
      const avgCompletionTime = this.calculateAverageCompletionTime(completedTasks);
      behavior.completionPattern = avgCompletionTime < 3600000 ? 'fast' : 'normal'; // 1 hour threshold
    }

    return behavior;
  }

  // Decide action for tasks in Todo column
  decideTodoAction(task, taskScore, columnContext) {
    const reasons = [];

    // High priority tasks move immediately
    if (task.priority === 'High') {
      reasons.push('High priority task - immediate attention required');
      return { action: 'move', targetColumn: 'inprogress', reasons };
    }

    // New tasks with low complexity move quickly
    if (taskScore.score >= 6 && !columnContext.isOverloaded) {
      reasons.push('High-scoring task with good column capacity');
      return { action: 'move', targetColumn: 'inprogress', reasons };
    }

    // Stay in todo if column is overloaded
    if (columnContext.isOverloaded) {
      reasons.push('Column overloaded - waiting for capacity');
      return { action: 'stay', reasons };
    }

    // Default: stay in todo
    reasons.push('Standard workflow - waiting for manual progression');
    return { action: 'stay', reasons };
  }

  // Decide action for tasks in In Progress column
  decideInProgressAction(task, taskScore, columnContext, userBehavior) {
    const reasons = [];

    // Completed tasks move to done immediately
    if (task.completed) {
      reasons.push('Task marked as completed - moving to done');
      return { action: 'move', targetColumn: 'done', reasons };
    }

    // Tasks with high activity and good scores
    if (userBehavior.hasRecentActivity && taskScore.score >= 5) {
      reasons.push('Active task with high score - ready for completion');
      return { action: 'move', targetColumn: 'done', reasons };
    }

    // Low priority tasks that have been in progress for a while
    if (task.priority === 'Low' && task.createdAt) {
      const timeInProgress = Date.now() - new Date(task.createdAt).getTime();
      if (timeInProgress > 1800000) { // 30 minutes
        reasons.push('Low priority task in progress too long - auto-completing');
        return { action: 'move', targetColumn: 'done', reasons };
      }
    }

    // Default: stay in progress
    reasons.push('Task still in progress - continuing work');
    return { action: 'stay', reasons };
  }

  // Calculate confidence in the decision
  calculateConfidence(task, reasons) {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on data quality
    if (task.priority && task.complexity) confidence += 0.2;
    if (task.createdAt && task.lastActivity) confidence += 0.2;
    if (reasons.length > 2) confidence += 0.1;

    // Cap confidence at 0.95
    return Math.min(confidence, 0.95);
  }

  // Store learning data for future improvements
  storeLearningData(taskId, analysis) {
    this.learningData.set(taskId, {
      ...analysis,
      storedAt: new Date().toISOString()
    });

    // Keep only last 100 entries to prevent memory issues
    if (this.learningData.size > 100) {
      const firstKey = this.learningData.keys().next().value;
      this.learningData.delete(firstKey);
    }
  }

  // Calculate activity frequency
  calculateActivityFrequency(taskId) {
    // This would be more sophisticated in a real implementation
    return Math.random() * 5; // Placeholder
  }

  // Calculate average completion time
  calculateAverageCompletionTime(completedTasks) {
    if (completedTasks.length === 0) return 0;
    
    const completionTimes = completedTasks
      .filter(task => task.createdAt && task.completedAt)
      .map(task => new Date(task.completedAt) - new Date(task.createdAt));
    
    if (completionTimes.length === 0) return 0;
    
    return completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length;
  }

  // Get AI insights for the board
  getBoardInsights(boardState) {
    const insights = {
      totalTasks: Object.keys(boardState.cards).length,
      completedTasks: Object.values(boardState.cards).filter(card => card.completed).length,
      averagePriority: this.calculateAveragePriority(boardState.cards),
      workloadDistribution: this.calculateWorkloadDistribution(boardState.columns),
      recommendations: this.generateBoardRecommendations(boardState)
    };

    return insights;
  }

  // Calculate average priority
  calculateAveragePriority(cards) {
    const priorityValues = Object.values(cards).map(card => {
      const values = { 'High': 3, 'Medium': 2, 'Low': 1 };
      return values[card.priority] || 2;
    });

    if (priorityValues.length === 0) return 'Medium';
    
    const avg = priorityValues.reduce((sum, val) => sum + val, 0) / priorityValues.length;
    if (avg >= 2.5) return 'High';
    if (avg >= 1.5) return 'Medium';
    return 'Low';
  }

  // Calculate workload distribution
  calculateWorkloadDistribution(columns) {
    const distribution = {};
    if (!columns) {
        return distribution;
       }
    Object.keys(columns).forEach(columnId => {
      const column = columns[columnId];
      const cardCount = column && column.cardIds ? column.cardIds.length : 0;
      distribution[columnId] = {
        count: cardCount,
        percentage: 0
      };
    });

    const total = Object.values(distribution).reduce((sum, col) => sum + col.count, 0);
    Object.values(distribution).forEach(col => {
      col.percentage = total > 0 ? (col.count / total) * 100 : 0;
    });

    return distribution;
  }

  // Generate board-level recommendations
  generateBoardRecommendations(boardState) {
    const recommendations = [];
// Ensure boardState and columns exist
             if (!boardState || !boardState.columns) {
             return recommendations;
            }
    // Check for overloaded columns
    Object.entries(boardState.columns).forEach(([columnId, column]) => {
      if (column && column.cardIds && column.cardIds.length > 5) {
        recommendations.push({
          type: 'workload',
          message: `${column.title || columnId} column is overloaded (${column.cardIds.length} tasks)`,
          suggestion: 'Consider moving some tasks or adding team members'
        });
      }
    });

    // Check for bottlenecks
   const inProgressColumn = boardState.columns.inprogress;
  const todoColumn = boardState.columns.todo;
   const inProgressCount = inProgressColumn && inProgressColumn.cardIds ? 
     inProgressColumn.cardIds.length : 0;
    const todoCount = todoColumn && todoColumn.cardIds ? todoColumn.cardIds.length : 0;
    if (inProgressCount === 0 && todoCount > 0) {
      recommendations.push({
        type: 'bottleneck',
        message: 'No tasks in progress while todo has tasks',
        suggestion: 'Start working on high-priority todo tasks'
      });
    }

    return recommendations;
  }

  // Get AI agent status
  getStatus() {
    return {
      name: this.name,
      version: this.version,
      learningDataSize: this.learningData.size,
      isActive: true,
      lastAnalysis: new Date().toISOString()
    };
  }
}

// Create and export singleton instance
const aiAgent = new AIAgent();
export default aiAgent;