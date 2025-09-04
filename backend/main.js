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

// Ensure the repos and generated_readmes directories exist
fs.mkdir(REPO_DIR, { recursive: true });
fs.mkdir(GENERATED_READMES_DIR, { recursive: true });

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

    // Optionally create a branch and push
    try {
        const git = simpleGit(repoPath);
        const branchName = `readme-ai-${Date.now()}`;
        await git.checkoutLocalBranch(branchName);
        await git.add('README.md');
        await git.commit('docs: generate README via AI agent');

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            console.warn('AI Agent: GITHUB_TOKEN not set. Skipping push.');
            return { readmeContent, branchName, pushed: false };
        }
        const remoteUrlWithToken = repoUrl.replace('https://', `https://${token}@`);
        await git.push(remoteUrlWithToken, branchName, ['--set-upstream']);
        return { readmeContent, readmePath, branchName, pushed: true };
    } catch (err) {
        console.error('AI Agent: Error committing/pushing README:', err.message);
        return { readmeContent, readmePath, branchName: null, pushed: false, error: err.message };
    }
}

async function runAIAgent(repoPath, taskDescription, repoUrl) {
    console.log('AI Agent: Received task:', taskDescription);
    console.log('AI Agent: Repository path:', repoPath);

    // 1. Always read all files in the repository for complete context
    console.log('AI Agent: Reading all files in the repository for complete analysis...');
    let files = [];
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
            try {
                originalFileContent = await fs.readFile(originalFilePath, 'utf-8');
            } catch (readError) {
                console.log(`File ${oldFileName} doesn't exist, creating new file`);
                originalFileContent = '';
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
        }

        console.log('AI Agent: All diffs applied successfully.');

    } catch (error) {
        console.error('Error applying patch:', error);
        console.error('AI Response was:', diffContent);
        return;
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

        // 2. Check if we need to generate/regenerate README
        const needReadmeGeneration = await shouldRegenerateReadme(repoPath, readmePath, repoUpdated);
        
        if (needReadmeGeneration) {
            console.log('Step 2: Generating comprehensive README (repository has changes or README missing)...');
            readmeResult = await generateReadmeForRepo(repoPath, repoUrl);
            console.log(`Comprehensive README generated and saved to: ${readmeResult.readmePath}`);
        } else {
            console.log('Step 2: Using existing README (no repository changes detected)...');
            try {
                const existingReadme = await fs.readFile(readmePath, 'utf-8');
                readmeResult = { 
                    readmeContent: existingReadme, 
                    readmePath: readmePath,
                    updated: false
                };
            } catch (error) {
                // Fallback - generate README if reading existing fails
                console.log('Failed to read existing README, generating new one...');
                readmeResult = await generateReadmeForRepo(repoPath, repoUrl);
            }
        }

        // 3. Execute the specific user task
        console.log('Step 3: Executing user task...');
        await runAIAgent(repoPath, taskDescription, repoUrl);

        res.status(200).json({
            message: 'Task processed successfully with smart update system.',
            repository: repoUrl,
            taskDescription: taskDescription.substring(0, 100) + '...',
            repositoryStatus: {
                existed: !repoCloned,
                cloned: repoCloned,
                updated: repoUpdated
            },
            readmeStatus: {
                generated: needReadmeGeneration,
                path: readmeResult.readmePath,
                updated: readmeResult.updated !== false
            },
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
