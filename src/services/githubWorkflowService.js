// src/services/githubWorkflowService.js
import { indexGithubRepo, getGithubFileContent, parseGithubUrl } from './indexingService';
import { createBranch, commitChanges, createPullRequest, getLatestSha } from './githubService';

class GitHubWorkflowService {
  constructor() {
    this.processingTasks = new Map();
  }

  // Apply task changes to GitHub repository
  async applyTaskToGitHub(task) {
    if (!task.githubUrl) {
      throw new Error('Task does not have a GitHub URL attached');
    }

    const taskId = task.id;
    this.processingTasks.set(taskId, { status: 'processing', startedAt: new Date() });

    try {
      // Parse GitHub URL to get repository info
      const repoInfo = parseGithubUrl(task.githubUrl);
      if (!repoInfo) {
        throw new Error('Invalid GitHub URL format');
      }

      // Create a unique branch name based on task
      const branchName = `task-${taskId}-${Date.now()}`;
      const baseBranch = 'main';

      // Get the latest commit SHA from base branch
      const latestShaResponse = await getLatestSha(baseBranch);
      const latestSha = latestShaResponse.data.sha;

      // Create new branch
      await createBranch(branchName, latestSha);

      // Index repository files to understand structure
      await indexGithubRepo(task.githubUrl, baseBranch);

      // Generate changes based on task description
      const changes = await this.generateChangesFromTask(task, repoInfo);

      if (changes.length === 0) {
        this.processingTasks.set(taskId, { 
          status: 'completed', 
          message: 'No changes generated from task description',
          completedAt: new Date()
        });
        return;
      }

      // Commit changes to the new branch
      const commitMessage = `Implement: ${task.title}\n\n${task.description}`;
      await commitChanges(branchName, commitMessage, changes);

      // Create pull request
      const prTitle = `🚀 ${task.title}`;
      const prBody = `## Task Implementation\n\n${task.description}\n\n### Changes Made:\n${changes.map(c => `- Modified ${c.path}`).join('\n')}\n\n---\n*Auto-generated from Kanban task #${taskId}*`;
      
      const pullRequest = await createPullRequest(prTitle, prBody, branchName, baseBranch);

      this.processingTasks.set(taskId, {
        status: 'completed',
        branchName,
        pullRequestUrl: pullRequest.data.html_url,
        pullRequestNumber: pullRequest.data.number,
        completedAt: new Date(),
        changes: changes.length
      });

      return {
        success: true,
        branchName,
        pullRequestUrl: pullRequest.data.html_url,
        pullRequestNumber: pullRequest.data.number,
        changesApplied: changes.length
      };

    } catch (error) {
      this.processingTasks.set(taskId, {
        status: 'error',
        error: error.message,
        completedAt: new Date()
      });
      
      console.error('GitHub workflow error:', error);
      throw error;
    }
  }

  // Generate code changes based on task description
  async generateChangesFromTask(task, repoInfo) {
    const changes = [];
    
    try {
      // This is a simplified implementation
      // In a real application, you would use AI/NLP to parse the task description
      // and generate appropriate code changes
      
      const description = task.description.toLowerCase();
      
      // Example patterns for common tasks
      if (description.includes('add') && description.includes('component')) {
        // Generate a new React component
        const componentName = this.extractComponentName(task.description) || 'NewComponent';
        changes.push({
          path: `src/components/${componentName}.js`,
          content: this.generateReactComponent(componentName, task.description),
          encoding: 'utf-8'
        });
      }
      
      if (description.includes('fix') && description.includes('bug')) {
        // Generate bug fix - this would need more sophisticated parsing
        changes.push({
          path: 'src/bugfix.js',
          content: `// Bug fix for: ${task.title}\n// ${task.description}\n\n// TODO: Implement actual fix based on task requirements`,
          encoding: 'utf-8'
        });
      }
      
      if (description.includes('update') && description.includes('style')) {
        // Generate CSS updates
        changes.push({
          path: 'src/styles/task-updates.css',
          content: `/* Style updates for: ${task.title} */\n/* ${task.description} */\n\n/* TODO: Add specific style changes */`,
          encoding: 'utf-8'
        });
      }
      
      // If no specific patterns match, create a general implementation file
      if (changes.length === 0) {
        changes.push({
          path: `src/implementations/task-${task.id}.js`,
          content: this.generateTaskImplementation(task),
          encoding: 'utf-8'
        });
      }
      
    } catch (error) {
      console.error('Error generating changes:', error);
    }
    
    return changes;
  }

  // Extract component name from task description
  extractComponentName(description) {
    const match = description.match(/(?:add|create)\s+(?:a\s+)?(\w+)\s+component/i);
    return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : null;
  }

  // Generate a basic React component
  generateReactComponent(componentName, description) {
    return `import React from 'react';

const ${componentName} = () => {
  return (
    <div className="${componentName.toLowerCase()}">
      <h2>${componentName}</h2>
      <p>Component created from task: ${description}</p>
      {/* TODO: Implement component functionality */}
    </div>
  );
};

export default ${componentName};
`;
  }

  // Generate general task implementation
  generateTaskImplementation(task) {
    return `// Task Implementation: ${task.title}
// Description: ${task.description}
// Created: ${new Date().toISOString()}
// Priority: ${task.priority}
// Tags: ${task.tags ? task.tags.join(', ') : 'None'}

/*
 * TODO: Implement the following based on task requirements:
 * ${task.description}
 */

export const taskImplementation = {
  title: '${task.title}',
  description: '${task.description}',
  priority: '${task.priority}',
  implementationStatus: 'pending',
  
  // Add your implementation here
  execute() {
    console.log('Executing task:', this.title);
    // Implementation logic goes here
    return { success: true, message: 'Task implementation completed' };
  }
};

export default taskImplementation;
`;
  }

  // Get processing status for a task
  getProcessingStatus(taskId) {
    return this.processingTasks.get(taskId) || { status: 'not_started' };
  }

  // Check if a task is currently being processed
  isProcessing(taskId) {
    const status = this.processingTasks.get(taskId);
    return status && status.status === 'processing';
  }

  // Clear processing status (cleanup)
  clearProcessingStatus(taskId) {
    this.processingTasks.delete(taskId);
  }

  // Get all processing statuses (for debugging)
  getAllProcessingStatuses() {
    return Object.fromEntries(this.processingTasks);
  }
}

// Export singleton instance
const githubWorkflowService = new GitHubWorkflowService();
export default githubWorkflowService;