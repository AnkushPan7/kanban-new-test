const express = require('express');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();
const { glob } = require('glob');
const axios = require('axios');
const diff = require('diff');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const Groq = require('groq-sdk');

const app = express();
app.use(express.json());
try {
  const cors = require('cors');
  app.use(cors({ origin: '*'}));
} catch (_) {
  console.warn('CORS not enabled: install cors if cross-origin requests fail');
}

// Initialize AI Services
if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY is not set in the .env file.');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Groq AI Setup
let groq = null;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
} else {
  console.warn('WARNING: GROQ_API_KEY is not set. AI processing will use Gemini fallback.');
}

const REPO_DIR = path.join(__dirname, 'repos');
const GENERATED_READMES_DIR = path.join(__dirname, 'generated_readmes');

// Ensure the directories exist
fs.mkdir(REPO_DIR, { recursive: true });
fs.mkdir(GENERATED_READMES_DIR, { recursive: true });

// Simple in-memory activity tracking for UI
class SimpleActivityTracker {
    constructor() {
        this.recentActivities = [];
    }

    addActivity(taskDescription, filesChanged, totalLinesAdded, totalLinesRemoved, files, repository) {
        const activity = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            taskDescription: taskDescription.substring(0, 80) + (taskDescription.length > 80 ? '...' : ''),
            repository,
            filesChanged,
            totalLinesAdded,
            totalLinesRemoved,
            // Clear file names for UI display
            changedFiles: files.map(f => f.file).join(', '), // Simple comma-separated list
            files: files.map(f => ({
                name: f.file,
                linesAdded: f.linesAdded,
                linesRemoved: f.linesRemoved,
                isNewFile: f.isNewFile
            }))
        };

        this.recentActivities.unshift(activity); // Add to beginning
        
        // Keep only last 20 activities for UI
        if (this.recentActivities.length > 20) {
            this.recentActivities = this.recentActivities.slice(0, 20);
        }

        return activity;
    }

    getRecentActivities() {
        return this.recentActivities;
    }
}

// Initialize simple activity tracker
const activityTracker = new SimpleActivityTracker();

// Add some sample activities for testing (remove this in production)
activityTracker.addActivity(
    "Add dark mode toggle functionality",
    2,
    45,
    12,
    [
        { file: "src/App.js", linesAdded: 25, linesRemoved: 5, isNewFile: false },
        { file: "src/App.css", linesAdded: 20, linesRemoved: 7, isNewFile: false }
    ],
    "vibe-temp"
);

activityTracker.addActivity(
    "Fix responsive navigation menu",
    1,
    15,
    8,
    [
        { file: "src/components/Navigation.js", linesAdded: 15, linesRemoved: 8, isNewFile: false }
    ],
    "kanban-app"
);

// ===== PLANNING AI AGENT - Agent #2 =====
// Specialized agent for analyzing tasks and planning file changes using README
async function callPlanningAgent(taskDescription, readmeContent, maxRetries = 3) {
    console.log("Planning Agent: Analyzing task complexity and required files...");
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro"});

    const prompt = `You are a specialized Code Planning Agent. Analyze the user task and determine what files need modification based on the repository structure shown in the README.

TASK TO IMPLEMENT:
"${taskDescription}"

REPOSITORY STRUCTURE AND INFO (from README.md):
${readmeContent}

YOUR JOB:
1. Study the repository structure and existing files mentioned in the README
2. For the given task, identify exactly which files need to be modified
3. Determine the complexity and confidence level
4. Return a precise JSON response

EXAMPLE ANALYSIS:
- If task is "Add dark mode toggle": Look for React components, CSS files, main App files
- If task is "Add new API endpoint": Look for backend routes, controllers, middleware files
- If task is "Fix button styling": Look for CSS files, component files with that button

REQUIRED JSON RESPONSE FORMAT:
{
    "complexity": "simple",
    "estimatedFiles": ["src/App.js", "src/App.css"],
    "reasoning": "Dark mode toggle requires state management in App.js and CSS styling in App.css",
    "confidence": "high",
    "taskType": "feature",
    "estimatedLines": 50,
    "dependencies": [],
    "riskLevel": "low"
}

COMPLEXITY RULES:
- simple: 1-3 files, straightforward changes (UI changes, styling, simple features)
- moderate: 4-8 files, some architecture changes (new components, API integration)
- complex: 9+ files, major refactoring or new architecture

CONFIDENCE RULES:
- high: Task is clear and files are obvious from project structure
- medium: Task requires some interpretation but files are identifiable
- low: Task is ambiguous and requires exploration

CRITICAL: Return ONLY valid JSON. No explanations, no markdown, just JSON.`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Planning Agent: Analyzing task (attempt ${attempt}/${maxRetries})...`);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const aiResponse = response.text();

            // Extract JSON from response (more robust parsing)
            let jsonString = aiResponse.trim();
            
            // Remove markdown code blocks if present
            if (jsonString.includes('```json')) {
                jsonString = jsonString.split('```json')[1].split('```')[0].trim();
            } else if (jsonString.includes('```')) {
                jsonString = jsonString.split('```')[1].split('```')[0].trim();
            }
            
            // Extract JSON object
            const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const plan = JSON.parse(jsonMatch[0]);
                    
                    // Validate required fields
                    if (!plan.complexity || !plan.estimatedFiles || !plan.confidence) {
                        throw new Error("Planning response missing required fields");
                    }
                    
                    console.log("Planning Agent: Task analysis complete");
                    console.log("Planning Agent: Complexity:", plan.complexity);
                    console.log("Planning Agent: Estimated files:", plan.estimatedFiles?.length || 0);
                    console.log("Planning Agent: Confidence:", plan.confidence);
                    
                    return plan;
                } catch (parseError) {
                    console.error("Planning Agent: JSON parsing failed:", parseError.message);
                    throw new Error(`Could not parse planning response as JSON: ${parseError.message}`);
                }
            } else {
                console.error("Planning Agent: No JSON found in response:", aiResponse.substring(0, 200));
                throw new Error("Could not find JSON in planning response");
            }
            
        } catch (error) {
            console.error(`Planning Agent: Attempt ${attempt} failed:`, error.message);
            
            if (error.message.includes('429') || error.message.includes('quota')) {
                // Try OpenAI fallback if available
                if (openai && attempt === maxRetries) {
                    try {
                        console.log("Planning Agent: Falling back to OpenAI...");
                        return await callPlanningAgentOpenAI(taskDescription, readmeContent);
                    } catch (openaiError) {
                        console.error("Planning Agent: OpenAI fallback failed:", openaiError.message);
                    }
                }
            }
            
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`Planning Agent: Retrying in ${delay/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // Return fallback plan if all attempts fail
            console.error("Planning Agent: All attempts failed, returning fallback plan");
            return {
                complexity: "moderate",
                estimatedFiles: [],
                reasoning: `Planning failed: ${error.message}. Will proceed with full repository analysis.`,
                confidence: "low",
                taskType: "unknown",
                estimatedLines: 0,
                dependencies: [],
                riskLevel: "medium"
            };
        }
    }
}

// OpenAI fallback for Planning Agent
async function callPlanningAgentOpenAI(taskDescription, readmeContent, maxRetries = 3) {
    if (!openai) {
        throw new Error('OpenAI client not initialized - OPENAI_API_KEY not set');
    }

    console.log("Planning Agent: Using OpenAI for task analysis...");

    const prompt = `You are a specialized Code Planning Agent. Analyze the task and determine what files need modification.

TASK: ${taskDescription}

REPOSITORY INFO:
${readmeContent}

Return JSON with: complexity, estimatedFiles, reasoning, confidence, taskType, estimatedLines, dependencies, riskLevel.
Complexity: simple (1-3 files), moderate (4-8 files), complex (9+ files).
Return ONLY valid JSON.`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                max_tokens: 1000,
                messages: [{ role: 'user', content: prompt }]
            });

            const aiResponse = completion.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const plan = JSON.parse(jsonMatch[0]);
                console.log("Planning Agent: OpenAI analysis complete");
                return plan;
            } else {
                throw new Error("Could not parse OpenAI response as JSON");
            }
            
        } catch (error) {
            console.error(`Planning Agent OpenAI attempt ${attempt} failed:`, error.message);
            
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            throw error;
        }
    }
}

async function callAIAgent(taskDescription, repoPath, fullRepoContent, maxRetries = 3) {
    console.log("AI Agent: Processing task with AI...");
    console.log("Task:", taskDescription);

    const prompt = `You are an expert full-stack developer specializing in making intelligent code changes based on user requirements. Your task is to analyze the provided codebase and implement the requested changes.

## Repository Content:
${fullRepoContent}

## User Task:
${taskDescription}

## Instructions:
1. **Analyze** the entire codebase to understand the structure, technologies used, and existing patterns
2. **Implement** the requested changes intelligently across multiple files if needed
3. **Maintain** code quality, consistency, and best practices
4. **Provide** a complete diff patch showing all changes

## Output Format:
Return your response as a unified diff patch that can be applied to the repository. The patch should include:
- Complete file paths relative to repository root
- Exact changes with proper context lines
- Multiple files if changes span across several files

Format as clean unified diff:
---
 a/path/to/file.js
+++ b/path/to/file.js
@@ -10,7 +10,7 @@
 old content
-context
+new content
-context

IMPORTANT: Make sure the diff is minimal and targeted, showing only the necessary changes.`;

    // First try Groq if available
    if (groq) {
        try {
            console.log("AI Agent: Using Groq AI...");
            const completion = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.1-8b-instant"
            });

            const aiResponse = completion.choices[0]?.message?.content;
            if (aiResponse) {
                console.log("AI Agent: Received response from Groq");
                return {
                    data: {
                        choices: [
                            {
                                message: {
                                    content: aiResponse
                                }
                            }
                        ]
                    }
                };
            }
        } catch (error) {
            console.error("AI Agent: Groq failed, falling back to Gemini:", error.message);
        }
    }

    // Fallback to Gemini
    console.log("AI Agent: Using Gemini AI as fallback...");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro"});

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`AI Agent: Calling Gemini AI model (attempt ${attempt}/${maxRetries})...`);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const aiResponse = response.text();

            console.log("AI Agent: Received response from Gemini");

            // Wrap in the expected format structure
            return {
                data: {
                    choices: [
                        {
                            message: {
                                content: aiResponse
                            }
                        }
                    ]
                }
            };

        } catch (error) {
            console.error(`AI Agent: Attempt ${attempt} failed:`, error.message);
            
            // Check if it's a quota exceeded error (429)
            if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('Too Many Requests')) {
                console.error("AI Agent: Quota exceeded. Please check your API billing and limits.");
                return {
                    data: {
                        choices: [
                            {
                                message: {
                                    content: `API Quota Exceeded: The Gemini AI service has reached its quota limit. Please check your API billing and rate limits at https://ai.google.dev/gemini-api/docs/rate-limits. Try again later or upgrade your plan.`
                                }
                            }
                        ]
                    }
                };
            }
            
            // Check if it's a service overload error (503)
            if (error.message.includes('503') || error.message.includes('overloaded')) {
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
                    console.log(`AI Agent: Retrying in ${delay/1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            
            // If not a retryable error or max retries reached
            console.error("AI Agent: Final attempt failed:", error);
            return {
                data: {
                    choices: [
                        {
                            message: {
                                content: `Error calling AI: ${error.message}`
                            }
                        }
                    ]
                }
            };
        }
    }
}

// OpenAI call to generate a README.md from repository content
async function callAIAgentForReadmeOpenAI(fullRepoContent, repoUrl, maxRetries = 3) {
    if (!openai) {
        throw new Error('OpenAI client not initialized - OPENAI_API_KEY not set');
    }

    console.log("AI Agent: Generating README with OpenAI...");

    const prompt = `Analyze the repository and generate a complete README.md file. Return ONLY the README content, no explanations or preambles.

Repository URL: ${repoUrl || 'N/A'}

Repository Files and Content:
${fullRepoContent}

Generate a comprehensive README.md that includes ALL of the following sections:

# [Project Name]

## Table of Contents
- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Key Components](#key-components)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Overview
[Describe what this project does based on the code analysis]

## Technology Stack
[List ALL technologies, frameworks, libraries found in package.json and imports]

## Project Structure
\`\`\`
[Complete directory tree with descriptions]
\`\`\`

## Features
[List all major functionality found in the code]

## Prerequisites
[System requirements based on package.json]

## Installation
[Step-by-step setup instructions]

## Configuration
[Environment variables and config files found]

## Usage
[Code examples and usage instructions]

## API Documentation
[All endpoints and their documentation if any found]

## Key Components
[Important functions, classes, and modules with purposes]

## Testing
[Testing setup and commands from package.json scripts]

## Deployment
[Build and deployment instructions]

## Contributing
[Guidelines for contributors]

## License
[License information]

IMPORTANT: 
- Return ONLY the markdown content
- Start directly with the project title (# [Project Name])
- Do NOT include any explanatory text before or after
- Analyze ALL files in the repository thoroughly
- Include specific details from the actual code files`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`AI Agent: Generating README with OpenAI (attempt ${attempt}/${maxRetries})...`);
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                max_tokens: 4096,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });

            const aiReadme = completion.choices[0].message.content;
            console.log("AI Agent: README generated successfully with OpenAI");
            return aiReadme;

        } catch (error) {
            console.error(`AI Agent: OpenAI README generation attempt ${attempt} failed:`, error.message);

            // Check if it's a quota or rate limit error
            if (error.message.includes('quota') || error.message.includes('rate limit') || error.message.includes('429')) {
                console.error("AI Agent: OpenAI quota exceeded.");
                throw new Error(`OpenAI API Quota Exceeded: ${error.message}. Please check your API billing and rate limits.`);
            }

            // Check if it's a service overload error (5xx)
            if (error.message.includes('503') || error.message.includes('504') || error.message.includes('overloaded')) {
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
                    console.log(`AI Agent: Retrying OpenAI README generation in ${delay/1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }

            // If not a retryable error or max retries reached
            console.error("AI Agent: Final OpenAI README generation attempt failed:", error);
            throw error;
        }
    }
}

// AI call to generate a README.md from repository content
async function callAIAgentForReadme(fullRepoContent, repoUrl, maxRetries = 3) {
    console.log("AI Agent: Generating README with Gemini AI...");
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro"});

    const prompt = `Analyze the repository and generate a complete README.md file. Return ONLY the README content, no explanations or preambles.

Repository URL: ${repoUrl || 'N/A'}

Repository Files and Content:
${fullRepoContent}

Generate a comprehensive README.md that includes ALL of the following sections:

# [Project Name]

## Table of Contents
- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Key Components](#key-components)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Overview
[Describe what this project does based on the code analysis]

## Technology Stack
[List ALL technologies, frameworks, libraries found in package.json and imports]

## Project Structure
\`\`\`
[Complete directory tree with descriptions]
\`\`\`

## Features
[List all major functionality found in the code]

## Prerequisites
[System requirements based on package.json]

## Installation
[Step-by-step setup instructions]

## Configuration
[Environment variables and config files found]

## Usage
[Code examples and usage instructions]

## API Documentation
[All endpoints and their documentation if any found]

## Key Components
[Important functions, classes, and modules with purposes]

## Testing
[Testing setup and commands from package.json scripts]

## Deployment
[Build and deployment instructions]

## Contributing
[Guidelines for contributors]

## License
[License information]

IMPORTANT: 
- Return ONLY the markdown content
- Start directly with the project title (# [Project Name])
- Do NOT include any explanatory text before or after
- Analyze ALL files in the repository thoroughly
- Include specific details from the actual code files`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`AI Agent: Generating README (attempt ${attempt}/${maxRetries})...`);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const aiReadme = response.text();

            console.log("AI Agent: README generated successfully");
            return aiReadme;
            
        } catch (error) {
            console.error(`AI Agent: README generation attempt ${attempt} failed:`, error.message);
            
            // Check if it's a quota exceeded error (429)
            if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('Too Many Requests')) {
                console.error("AI Agent: Gemini quota exceeded. Attempting fallback to OpenAI...");

                // If OpenAI is available, try it as fallback
                if (openai) {
                    try {
                        console.log("AI Agent: Falling back to OpenAI for README generation...");
                        const openaiReadme = await callAIAgentForReadmeOpenAI(fileContents, repoUrl);
                        return openaiReadme;
                    } catch (openaiError) {
                        console.error("AI Agent: OpenAI fallback also failed:", openaiError.message);
                        throw new Error(`Both Gemini and OpenAI services reached quota limits. Gemini: ${error.message}. OpenAI: ${openaiError.message}. Please check your API billing and rate limits.`);
                    }
                } else {
                    console.error("AI Agent: OpenAI not available as fallback (OPENAI_API_KEY not set).");
                    throw new Error(`API Quota Exceeded: Gemini AI service reached its quota limit. Please set OPENAI_API_KEY for OpenAI fallback or upgrade Gemini API plan. Original error: ${error.message}`);
                }
            }
            
            // Check if it's a service overload error (503)
            if (error.message.includes('503') || error.message.includes('overloaded')) {
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
                    console.log(`AI Agent: Retrying README generation in ${delay/1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            
            // If not a retryable error or max retries reached
            console.error("AI Agent: Final README generation attempt failed:", error);
            throw error;
        }
    }
}

async function generateReadmeForRepo(repoPath, repoUrl) {
    console.log('AI Agent: Preparing repository content for README generation...');
    // Collect repo files similar to runAIAgent
    let files = [];
    try {
        const foundFiles = await glob('**/*', { cwd: repoPath, ignore: ['node_modules/**', '.git/**'], nodir: true });
        if (Array.isArray(foundFiles)) files = foundFiles;
    } catch (error) {
        console.error('Error reading files with glob:', error);
    }

    let fileContents = '';
    const MAX_TOTAL_LENGTH = 100000; // 100k characters limit
    for (const file of files) {
        if (fileContents.length > MAX_TOTAL_LENGTH) {
            console.log('AI Agent: Reached total content limit, stopping file reading.');
            break;
        }
        try {
            // Limit very large files to avoid token overload
            const content = await fs.readFile(path.join(repoPath, file), 'utf-8');
            const truncated = content.length > 8000 ? content.slice(0, 8000) + "\n\n/* …truncated… */" : content;
            fileContents += `--- ${file} ---
${truncated}

`;
        } catch (error) {
            console.log(`Skipping file ${file}: ${error.message}`);
        }
    }

    const readmeContent = await callAIAgentForReadme(fileContents, repoUrl);

    // Save to centralized generated_readmes directory (one file per repository)
    const repoName = path.basename(repoUrl, '.git');
    const readmePath = path.join(GENERATED_READMES_DIR, `${repoName}_README.md`);
    
    console.log(`Saving generated README to: ${readmePath}`);
    await fs.writeFile(readmePath, readmeContent, 'utf-8');

    // README generated successfully - no branch creation needed
    console.log('AI Agent: README content generated and saved locally for planning context');
    return { readmeContent, readmePath, branchCreated: false, pushed: false };
}

// ===== EXECUTION AI AGENT - Agent #3 (Enhanced with Planning) =====
async function runAIAgent(repoPath, taskDescription, repoUrl, taskPlan = null) {
    console.log('Execution Agent: Received task:', taskDescription);
    console.log('Execution Agent: Repository path:', repoPath);

    // 1. Smart file reading based on planning results
    let files = [];
    if (taskPlan && taskPlan.estimatedFiles && taskPlan.estimatedFiles.length > 0 && taskPlan.confidence !== 'low') {
        console.log('Execution Agent: Using targeted file reading based on Planning Agent results...');
        console.log('Execution Agent: Target files from plan:', taskPlan.estimatedFiles);
        
        // Use planned files + some additional context files
        const plannedFiles = taskPlan.estimatedFiles;
        const contextFiles = ['package.json', 'README.md', 'tsconfig.json', '.env.example']; // Always include these for context
        
        files = [...plannedFiles, ...contextFiles];
        
        // Verify files exist and add related files
        const verifiedFiles = [];
        for (const file of files) {
            try {
                await fs.access(path.join(repoPath, file));
                verifiedFiles.push(file);
                
                // Add related files (same directory)
                const dir = path.dirname(file);
                if (dir !== '.' && dir !== '/') {
                    try {
                        const relatedFiles = await glob(`${dir}/*`, { cwd: repoPath, ignore: ['node_modules/**', '.git/**'], nodir: true });
                        // Add up to 3 related files from same directory
                        verifiedFiles.push(...relatedFiles.slice(0, 3));
                    } catch (error) {
                        console.log(`Could not read related files in ${dir}:`, error.message);
                    }
                }
            } catch {
                console.log(`Execution Agent: Planned file ${file} not found, will search for similar...`);
            }
        }
        
        files = [...new Set(verifiedFiles)]; // Remove duplicates
        
        if (files.length === 0) {
            console.log('Execution Agent: No planned files found, falling back to full repository scan...');
            const foundFiles = await glob('**/*', { cwd: repoPath, ignore: ['node_modules/**', '.git/**'], nodir: true });
            files = Array.isArray(foundFiles) ? foundFiles : [];
        } else {
            console.log(`Execution Agent: Reading ${files.length} targeted files (planned + context + related)`);
        }
    } else {
        console.log('Execution Agent: No valid plan available, reading all repository files...');
        try {
            const foundFiles = await glob('**/*', { cwd: repoPath, ignore: ['node_modules/**', '.git/**'], nodir: true });
            if (Array.isArray(foundFiles)) {
                files = foundFiles;
            } else {
                console.log('Warning: glob did not return an array. Result:', foundFiles);
            }
        } catch (error) {
            console.error('Error reading files with glob:', error);
        }
    }

    let fileContents = '';
    const MAX_TOTAL_LENGTH = 100000; // 100k characters limit
    for (const file of files) {
        if (fileContents.length > MAX_TOTAL_LENGTH) {
            console.log('AI Agent: Reached total content limit, stopping file reading.');
            break;
        }
        try {
            const content = await fs.readFile(path.join(repoPath, file), 'utf-8');
            const truncated = content.length > 8000 ? content.slice(0, 8000) + "\n\n/* …truncated… */" : content;
            fileContents += `--- ${file} ---
${truncated}

`;
        } catch (error) {
            console.log(`Skipping file ${file}: ${error.message}`);
        }
    }
    console.log('AI Agent: Files read successfully.');

    // 3. Call the AI model with full context
    console.log('AI Agent: Calling direct AI processing...');
    const aiResponse = await callAIAgent(taskDescription, repoPath, fileContents);
    const diffContent = aiResponse.data.choices[0].message.content;
    console.log('AI Agent: AI model returned a diff.');

    // 4. Apply the diff(s)
    console.log('AI Agent: Applying diff...');
    console.log('Raw AI Response:', diffContent);

    if (diffContent.includes("Error calling AI") || diffContent.includes('API Quota Exceeded') || diffContent.includes("Could not parse")) {
        console.error("Aborting due to error from AI agent:", diffContent);
        throw new Error(diffContent);
    }

    let changesSummary = null;

    try {
        // Extract diff content (remove any markdown code blocks)
        let patchContent = diffContent;
        if (diffContent.includes('```diff')) {
            patchContent = diffContent.split('```diff')[1].split('```')[0].trim();
        } else if (diffContent.includes('```')) {
            patchContent = diffContent.split('```')[1].split('```')[0].trim();
        }

        console.log('Processing patch content:', patchContent);

        // Handle multiple patches (for complex changes spanning multiple files)
        const patches = diff.parsePatch(patchContent);
        console.log(`Found ${patches.length} patch(es) to apply`);

        // Track file changes for activity log
        const changedFiles = [];
        let totalLinesAdded = 0;
        let totalLinesRemoved = 0;

        for (const patch of patches) {
            if (!patch || !patch.oldFileName) {
                console.log('Skipping invalid patch');
                continue;
            }

            const oldFileName = patch.oldFileName.replace(/^[a|b]\//, ''); // Remove a/ or b/ prefix
            const originalFilePath = path.join(repoPath, oldFileName);

            console.log(`Processing file: ${oldFileName}`);

            // Read original file content
            let originalFileContent;
            let isNewFile = false;
            try {
                originalFileContent = await fs.readFile(originalFilePath, 'utf-8');
            } catch (readError) {
                console.log(`File ${oldFileName} doesn't exist, creating new file`);
                originalFileContent = '';
                isNewFile = true;
            }

            // Apply the patch
            const appliedContent = diff.applyPatch(originalFileContent, patch);

            if (appliedContent === false) {
                console.error(`Failed to apply patch to ${oldFileName}`);
                console.log('Patch content:', patchContent);
                console.log('Original content:', originalFileContent);
                // Don't return, continue with other patches
                continue;
            }

            // Ensure directory exists for new files
            const fileDir = path.dirname(originalFilePath);
            await fs.mkdir(fileDir, { recursive: true });

            // Write the updated content
            await fs.writeFile(originalFilePath, appliedContent);
            console.log(`Successfully updated: ${oldFileName}`);

            // Track changes for activity log
            const linesAdded = patch.hunks.reduce((acc, hunk) => acc + hunk.lines.filter(line => line.startsWith('+')).length, 0);
            const linesRemoved = patch.hunks.reduce((acc, hunk) => acc + hunk.lines.filter(line => line.startsWith('-')).length, 0);
            
            totalLinesAdded += linesAdded;
            totalLinesRemoved += linesRemoved;

            changedFiles.push({
                file: oldFileName,
                linesAdded,
                linesRemoved,
                isNewFile,
                size: appliedContent.length
            });
        }

        console.log('AI Agent: All diffs applied successfully.');

        // Track file changes for UI activity panel
        if (changedFiles.length > 0) {
            activityTracker.addActivity(
                taskDescription,
                changedFiles.length,
                totalLinesAdded,
                totalLinesRemoved,
                changedFiles,
                path.basename(repoPath)
            );
        }

        // Return change summary for response
        changesSummary = {
            filesChanged: changedFiles.length,
            totalLinesAdded,
            totalLinesRemoved,
            files: changedFiles
        };

    } catch (error) {
        console.error('Error applying patch:', error);
        console.error('AI Response was:', diffContent);
        changesSummary = {
            filesChanged: 0,
            totalLinesAdded: 0,
            totalLinesRemoved: 0,
            files: [],
            error: error.message
        };
    }


    // Now, let's commit and push the changes.
    try {
        const git = simpleGit(repoPath);
        const branchName = `ai-changes-${Date.now()}`;

        await git.checkoutLocalBranch(branchName);
        await git.add('.');
        await git.commit(`AI commit: ${taskDescription}`);

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            // In a real app, you'd handle this more gracefully.
            // For now, we'll just log an error and skip the push.
            console.error('AI Agent: GITHUB_TOKEN environment variable is not set. Skipping push.');
            return;
        }

        const remoteUrlWithToken = repoUrl.replace('https://', `https://${token}@`);

        await git.push(remoteUrlWithToken, branchName, ['--set-upstream']);

        console.log(`AI Agent: Pushed changes to new branch: ${branchName}`);

    } catch (error) {
        console.error('AI Agent: Error committing and pushing changes:', error);
    }

    console.log('AI Agent: Task processing complete.');
    
    return changesSummary;
}

// Removed smart task planning - now always doing full repository analysis

// Smart repository and README update system
async function checkRepositoryUpdates(repoPath, repoUrl) {
    console.log("AI Agent: Checking for repository updates...");
    
    try {
        const git = simpleGit(repoPath);
        
        // Fetch latest changes from remote
        await git.fetch();
        
        // Get the current branch name and check if local is behind remote
        const status = await git.status();
        const currentBranch = status.current || 'main';
        const localCommit = await git.revparse(['HEAD']);
        
        // Try to get remote commit (handle both main/master)
        let remoteCommit;
        try {
            remoteCommit = await git.revparse([`origin/${currentBranch}`]);
        } catch (error) {
            // Fallback to main or master
            try {
                remoteCommit = await git.revparse(['origin/main']);
            } catch {
                remoteCommit = await git.revparse(['origin/master']);
            }
        }
        
        const hasUpdates = localCommit !== remoteCommit;
        
        if (hasUpdates) {
            console.log("AI Agent: Repository has updates, pulling latest changes...");
            await git.pull();
            return { updated: true, localCommit, remoteCommit };
        } else {
            console.log("AI Agent: Repository is up to date");
            return { updated: false, localCommit, remoteCommit };
        }
    } catch (error) {
        console.error("AI Agent: Error checking repository updates:", error.message);
        // If error, assume we need to update
        return { updated: true, error: error.message };
    }
}

async function shouldRegenerateReadme(repoPath, readmePath, repoUpdated) {
    // Check if README exists for this repository
    try {
        await fs.access(readmePath);
        
        if (repoUpdated) {
            console.log("AI Agent: Repository was updated, updating existing README");
            return true;
        } else {
            console.log("AI Agent: README exists and repository unchanged, using existing README");
            return false;
        }
    } catch {
        console.log("AI Agent: README doesn't exist for this repository, generating new one");
        return true;
    }
}

app.post('/api/tasks', async (req, res) => {
    const { repoUrl, taskDescription } = req.body;

    if (!repoUrl || !taskDescription) {
        return res.status(400).json({ error: 'repoUrl and taskDescription are required' });
    }

    try {
        const repoName = path.basename(repoUrl, '.git');
        const repoPath = path.join(REPO_DIR, repoName);
        // One README file per repository (no date in filename)
        const readmePath = path.join(GENERATED_READMES_DIR, `${repoName}_README.md`);

        let repoCloned = false;
        let repoUpdated = false;
        let readmeResult = null;

        // 1. Check if repository exists locally
        try {
            await fs.access(repoPath);
            console.log(`Repository exists locally at: ${repoPath}`);
            
            // Check for updates
            const updateResult = await checkRepositoryUpdates(repoPath, repoUrl);
            repoUpdated = updateResult.updated;
            
        } catch {
            // Repository doesn't exist, clone it
            console.log('Step 1: Cloning repository...');
            const git = simpleGit();
            await git.clone(repoUrl, repoPath);
            console.log(`Repository cloned to ${repoPath}`);
            repoCloned = true;
            repoUpdated = true; // New clone means "updated"
        }

        // 2. Check if we need README for task planning (but don't generate branch unless explicitly needed)
        try {
            // Try to read existing README first for planning context
            const existingReadme = await fs.readFile(readmePath, 'utf-8');
            readmeResult = { 
                readmeContent: existingReadme, 
                readmePath: readmePath,
                updated: false
            };
            console.log('Step 2: Using existing README for task planning...');
        } catch (error) {
            // Only generate README if absolutely needed and no existing one found
            console.log('Step 2: No existing README found, generating for task context (no branch creation)...');
            console.log('AI Agent: Preparing repository content for task planning...');
            
            // Generate README content but don't create branch/commit
            let files = [];
            try {
                const foundFiles = await glob('**/*', { cwd: repoPath, ignore: ['node_modules/**', '.git/**'], nodir: true });
                if (Array.isArray(foundFiles)) files = foundFiles;
            } catch (error) {
                console.error('Error reading files with glob:', error);
            }

            let fileContents = '';
            const MAX_TOTAL_LENGTH = 100000;
            for (const file of files) {
                if (fileContents.length > MAX_TOTAL_LENGTH) break;
                try {
                    const content = await fs.readFile(path.join(repoPath, file), 'utf-8');
                    const truncated = content.length > 8000 ? content.slice(0, 8000) + "\n\n/* …truncated… */" : content;
                    fileContents += `--- ${file} ---\n${truncated}\n\n`;
                } catch (error) {
                    console.log(`Skipping file ${file}: ${error.message}`);
                }
            }
            
            const readmeContent = await callAIAgentForReadme(fileContents, repoUrl);
            await fs.writeFile(readmePath, readmeContent, 'utf-8');
            
            readmeResult = { 
                readmeContent, 
                readmePath,
                updated: true,
                branchCreated: false  // No branch created for this README
            };
        }

        // 3. Plan the task using Planning Agent
        console.log('Step 3: Planning task with AI Planning Agent...');
        let taskPlan = null;
        try {
            taskPlan = await callPlanningAgent(taskDescription, readmeResult.readmeContent);
            console.log(`Planning Agent: Task complexity: ${taskPlan.complexity}`);
            console.log(`Planning Agent: Files to modify: ${taskPlan.estimatedFiles?.length || 0}`);
        } catch (planningError) {
            console.error('Planning Agent failed, proceeding with full analysis:', planningError.message);
        }

        // 4. Execute the specific user task with planning context
        console.log('Step 4: Executing user task with smart file targeting...');
        const changesSummary = await runAIAgent(repoPath, taskDescription, repoUrl, taskPlan);

        res.status(200).json({
            message: 'Task processed successfully with multi-agent system.',
            repository: repoUrl,
            taskDescription: taskDescription.substring(0, 100) + '...',
            repositoryStatus: {
                existed: !repoCloned,
                cloned: repoCloned,
                updated: repoUpdated
            },
            readmeStatus: {
                generated: readmeResult?.updated || false,
                path: readmeResult?.readmePath,
                updated: readmeResult?.updated !== false,
                branchCreated: readmeResult?.branchCreated !== false
            },
            planning: {
                used: !!taskPlan,
                complexity: taskPlan?.complexity || 'unknown',
                estimatedFiles: taskPlan?.estimatedFiles?.length || 0,
                confidence: taskPlan?.confidence || 'unknown',
                taskType: taskPlan?.taskType || 'unknown'
            },
            changes: changesSummary,
            readmeContent: readmeResult.readmeContent ? readmeResult.readmeContent.substring(0, 500) + '...' : 'Generated'
        });

    } catch (error) {
        console.error('Task processing failed:', error);
        res.status(500).json({ error: 'An error occurred while processing the task: ' + error.message });
    }
});

// Generate README for a provided repository URL
app.post('/api/generate-readme', async (req, res) => {
    const { repoUrl } = req.body;

    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }

    try {
        const repoName = path.basename(repoUrl, '.git');
        const repoPath = path.join(REPO_DIR, repoName);

        // Clean up previous clone if it exists
        await fs.rm(repoPath, { recursive: true, force: true });

        const git = simpleGit();
        console.log(`Cloning repository for README generation: ${repoUrl}`);
        await git.clone(repoUrl, repoPath);

        console.log(`Repository cloned to ${repoPath}`);

        const result = await generateReadmeForRepo(repoPath, repoUrl);

        res.status(200).json({
            message: 'README generated successfully',
            repository: repoUrl,
            readmeContent: result.readmeContent,
            result
        });

    } catch (error) {
        console.error('README generation failed:', error);
        res.status(500).json({ error: 'Failed to generate README: ' + error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {   
    console.log(`Server running on port ${PORT}`);   
});

// ===== PLANNING AGENT ENDPOINT =====
app.post('/api/plan-task', async (req, res) => {
    const { repoUrl, taskDescription } = req.body;

    if (!repoUrl || !taskDescription) {
        return res.status(400).json({ error: 'repoUrl and taskDescription are required' });
    }

    try {
        const repoName = path.basename(repoUrl, '.git');
        const readmePath = path.join(GENERATED_READMES_DIR, `${repoName}_README.md`);

        // Check if README exists
        let readmeContent;
        try {
            readmeContent = await fs.readFile(readmePath, 'utf-8');
        } catch (error) {
            return res.status(404).json({ 
                error: 'README not found. Please generate repository documentation first.',
                suggestion: 'Call /api/generate-readme or /api/tasks to create README first'
            });
        }

        // Call Planning Agent
        console.log('Planning Agent: Starting task analysis...');
        const plan = await callPlanningAgent(taskDescription, readmeContent);

        res.status(200).json({
            message: 'Task analysis completed successfully',
            repository: repoUrl,
            taskDescription,
            plan,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Planning Agent failed:', error);
        res.status(500).json({ 
            error: 'Task planning failed: ' + error.message,
            fallback: 'Will proceed with full repository analysis if needed'
        });
    }
});

// Simple Activity Endpoint for UI Right Panel
app.get('/api/activity', async (req, res) => {
    try {
        const activities = activityTracker.getRecentActivities();
        res.status(200).json({
            activities,
            total: activities.length
        });
    } catch (error) {
        console.error('Failed to fetch activities:', error);
        res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
});

// --- Test endpoint for development ---
app.post('/api/test', async (req, res) => {
    const { taskDescription } = req.body;

    if (!taskDescription) {
        return res.status(400).json({ error: 'taskDescription is required' });
    }

    res.json({
        message: 'Direct AI processing demonstrated',
        taskDescription,
        instruction: 'This endpoint processes the description directly with AI (no regex parsing)',
        example: 'Try: "Implement a complete authentication system with React Router and local storage"'
    });
});
