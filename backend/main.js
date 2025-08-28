const express = require('express');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();
const { glob } = require('glob');
const axios = require('axios');
const diff = require('diff');

const app = express();
app.use(express.json());

const REPO_DIR = path.join(__dirname, 'repos');

// Ensure the repos directory exists
fs.mkdir(REPO_DIR, { recursive: true });

async function callAIAgent(prompt, repoPath) {
    console.log("AI Prompt:", prompt);

    // Simple parser for the task description
    const taskDescription = prompt.split('\n\n')[0];
    const addMatch = taskDescription.match(/add\s+(.+?)\s+in\s+(.+?)\s+file/i);


    if (!addMatch) {
        console.error("Could not parse task description");
        return { data: { choices: [{ message: { content: "Could not parse task description" } }] } };
    }

    const newContent = addMatch[1].replace(/`/g, '');
    const filePath = addMatch[2].replace(/`/g, '');

    const fullPath = path.join(repoPath, filePath);

    try {
        const originalContent = await fs.readFile(fullPath, 'utf-8');

        // This is a very basic way to add the content at the end of the file.
        // A more robust solution would use a proper parser for the file type.
        const updatedContent = originalContent + '\n' + newContent;

        const patch = diff.createPatch(filePath, originalContent, updatedContent);

        return {
            data: {
                choices: [
                    {
                        message: {
                            content: "```diff\n" + patch + "\n```"
                        }
                    }
                ]
            }
        };
    } catch (error) {
        console.error("Error processing file:", error);
        return { data: { choices: [{ message: { content: "Error processing file: " + error.message } }] } };
    }
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
            fileContents += `--- ${file} ---
${content}\n\n`;
        } catch (error) {
            console.log(`Skipping file ${file}: ${error.message}`);
        }
    }
    console.log('AI Agent: Files read successfully.');

    // 2. Create a prompt for the AI model
    const prompt = `The user wants to make the following change to the codebase: ${taskDescription}.\n\nHere are the current files:\n\n${fileContents}`;

    // 3. Call the AI model
    console.log('AI Agent: Calling AI model...');
    const aiResponse = await callAIAgent(prompt, repoPath);
    const diffContent = aiResponse.data.choices[0].message.content;
    console.log('AI Agent: AI model returned a diff.');

    // 4. Apply the diff
    console.log('AI Agent: Applying diff...');
    console.log(diffContent);

    if (diffContent.includes("Could not parse task description") || diffContent.includes("Error processing file")) {
        console.error("Aborting due to error from AI agent.");
        return;
    }

    try {
        const patchContent = diffContent.substring(diffContent.indexOf('---'), diffContent.lastIndexOf('```')).trim();
        const patchedFile = diff.parsePatch(patchContent)[0];
        
        const oldFileName = patchedFile.oldFileName.replace(/\\/g, '/');
        const originalFilePath = path.join(repoPath, oldFileName);

        const originalFileContent = await fs.readFile(originalFilePath, 'utf-8');
        const appliedContent = diff.applyPatch(originalFileContent, patchContent);

        if (appliedContent === false) {
            console.error("Failed to apply patch");
            return;
        }

        await fs.writeFile(originalFilePath, appliedContent);

        console.log('AI Agent: Diff applied successfully.');
    } catch (error) {
        console.error('Error applying patch:', error);
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
