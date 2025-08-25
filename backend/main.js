const express = require('express');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();
const { glob } = require('glob');
const axios = require('axios');

const app = express();
app.use(express.json());

const REPO_DIR = path.join(__dirname, 'repos');

// Ensure the repos directory exists
fs.mkdir(REPO_DIR, { recursive: true });

async function callAIAgent(prompt) {
    // In a real implementation, you would call your AI model here.
    // For this example, we'll return a dummy response.
    console.log("AI Prompt:", prompt);
    return {
        data: {
            choices: [
                {
                    message: {
                        content: "```diff\n--- a/src/App.js\n+++ b/src/App.js\n@@ -1,11 +1,12 @@\n import logo from './logo.svg';\n import './App.css';\n+import Button from '@mui/material/Button';\n \n function App() {\n   return (\n     <div className=\"App\">\n       <header className=\"App-header\">\n         <img src={logo} className=\"App-logo\" alt=\"logo\" />\n         <p>\n-          Edit src/App.js and save to reload.\n+          Hello from Gemini!\n         </p>\n         <a\n           className=\"App-link\"\n           href=\"https://reactjs.org\"\n@@ -18,6 +19,7 @@\n         >\n           Learn React\n         </a>\n+        <Button variant=\"contained\">Hello World</Button>\n       </header>\n     </div>\n   );\n }\n```"
                    }
                }
            ]
        }
    };
}

async function runAIAgent(repoPath, taskDescription, repoUrl) {
    console.log('AI Agent: Received task:', taskDescription);
    console.log('AI Agent: Repository path:', repoPath);

    // 1. Read all files in the repository
    console.log('AI Agent: Reading files...');
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
    for (const file of files) {
        try {
            const content = await fs.readFile(path.join(repoPath, file), 'utf-8');
            fileContents += `--- ${file} ---\n${content}\n\n`;
        } catch (error) {
            console.log(`Skipping file ${file}: ${error.message}`);
        }
    }
    console.log('AI Agent: Files read successfully.');

    // 2. Create a prompt for the AI model
    const prompt = `The user wants to make the following change to the codebase: ${taskDescription}.\n\nHere are the current files:\n\n${fileContents}`;

    // 3. Call the AI model
    console.log('AI Agent: Calling AI model...');
    const aiResponse = await callAIAgent(prompt);
    const diff = aiResponse.data.choices[0].message.content;
    console.log('AI Agent: AI model returned a diff.');

    // 4. Apply the diff
    console.log('AI Agent: Applying diff...');
    console.log(diff);
    const diffLines = diff.split('\n');
    let currentFile = '';
    let currentFileContent = '';

    for (const line of diffLines) {
        if (line.startsWith('--- a/')) {
            if (currentFile) {
                console.log(`AI Agent: Writing changes to ${currentFile}`);
                await fs.writeFile(path.join(repoPath, currentFile), currentFileContent);
            }
            currentFile = line.substring(6);
            try {
                currentFileContent = await fs.readFile(path.join(repoPath, currentFile), 'utf-8');
            } catch (e) {
                console.error(`AI Agent: Error reading file ${currentFile}:`, e);
                currentFileContent = '';
            }
        } else if (line.startsWith('+++ b/')) {
            // ignore
        } else if (line.startsWith('@@')) {
            // ignore
        } else if (line.startsWith('-')) {
            currentFileContent = currentFileContent.replace(line.substring(1) + '\n', '');
        } else if (line.startsWith('+')) {
            currentFileContent += line.substring(1) + '\n';
        }
    }
    if (currentFile) {
        console.log(`AI Agent: Writing changes to ${currentFile}`);
        await fs.writeFile(path.join(repoPath, currentFile), currentFileContent);
    }
    console.log('AI Agent: Diff applied successfully.');


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

app.post('/api/tasks', async (req, res) => {
    const { repoUrl, taskDescription } = req.body;

    if (!repoUrl || !taskDescription) {
        return res.status(400).json({ error: 'repoUrl and taskDescription are required' });
    }

    try {
        // 1. Clone the repository
        const repoName = path.basename(repoUrl, '.git');
        const repoPath = path.join(REPO_DIR, repoName);

        // Clean up previous clone if it exists
        await fs.rm(repoPath, { recursive: true, force: true });

        const git = simpleGit();
        await git.clone(repoUrl, repoPath);

        console.log(`Repository cloned to ${repoPath}`);

        // 2. Run the AI Agent
        await runAIAgent(repoPath, taskDescription, repoUrl);

        res.status(200).json({ message: 'Task processed successfully.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while processing the task.' });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});