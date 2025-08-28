require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Octokit } = require('@octokit/rest');

// --- Setup ---
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json());

// --- Gemini AI Setup ---
if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY is not set in the .env file.');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- GitHub Setup ---
if (!process.env.GITHUB_TOKEN) {
  console.error('WARNING: GITHUB_TOKEN is not set in the .env file. GitHub functionality will be disabled.');
}
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// --- AI File Processing Endpoint ---
app.post('/api/ai/process-file', upload.single('file'), async (req, res) => {
  const { description } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  if (!description) {
    return res.status(400).json({ message: 'No description provided.' });
  }

  try {
    const fileContent = file.buffer.toString('utf-8');
    console.log('--- Original File Content ---');
    console.log(fileContent);

    console.log('--- Calling Gemini API ---');
    const modifiedContent = await processWithAI(fileContent, description);
    
    console.log('--- Modified File Content (from AI) ---');
    console.log(modifiedContent);

    // Save the modified file
    const processedDir = path.join(__dirname, 'processed_files');
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir);
    }
    const newFilePath = path.join(processedDir, `processed_${file.originalname}`);
    fs.writeFileSync(newFilePath, modifiedContent);
    console.log(`--- Saved modified file to: ${newFilePath} ---`);

    // Log the change
    logChange(file.originalname, description, modifiedContent);

    res.json({
      message: 'File processed and saved successfully.', 
      originalContent: fileContent, 
      modifiedContent: modifiedContent,
      downloadPath: `/processed_files/processed_${file.originalname}`
    });

  } catch (error) {
    console.error('Error in /api/ai/process-file:', error);
    res.status(500).json({ message: 'Error processing file with AI', error: error.message });
  }
});

async function processWithAI(content, instruction) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro"});

    const prompt = `You are an expert code editor. Your task is to analyze and modify code in a GitHub repository based on the user's task description. Follow these steps:
1. Review the task description to identify the required code changes in the repository.
2. Apply the necessary changes based on the task description.
3. Return only the modified code related to the specified changes, without any extra comments or explanations.

Instruction: "${instruction}"
Task Description: 
---
${content}
---
Return only the updated code as per the task description. Do not include any extra explanations, file names, or unnecessary formatting.`;
    console.log('--- Prompt sent to Gemini ---');
    console.log(prompt);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw new Error('Failed to process text with AI.');
  }
}

// --- GitHub API Endpoints ---
app.post('/api/github/branch', async (req, res) => {
  const { branchName, sha } = req.body;
  
  if (!process.env.GITHUB_TOKEN) {
    return res.status(400).json({ error: 'GitHub token not configured' });
  }

  if (!process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
    return res.status(400).json({ error: 'GitHub repository owner/repo not configured' });
  }

  try {
    const response = await octokit.rest.git.createRef({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      ref: `refs/heads/${branchName}`,
      sha: sha
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/github/commit', async (req, res) => {
  const { branchName, message, files } = req.body;
  
  if (!process.env.GITHUB_TOKEN) {
    return res.status(400).json({ error: 'GitHub token not configured' });
  }

  if (!process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
    return res.status(400).json({ error: 'GitHub repository owner/repo not configured' });
  }

  try {
    // Get current commit SHA for the branch
    const refResponse = await octokit.rest.git.getRef({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      ref: `heads/${branchName}`
    });

    const currentSha = refResponse.data.object.sha;
    
    // Get current tree
    const currentCommit = await octokit.rest.git.getCommit({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      commit_sha: currentSha
    });

    // Create blobs for new files
    const tree = [];
    for (const file of files) {
      const blobResponse = await octokit.rest.git.createBlob({
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        content: Buffer.from(file.content).toString('base64'),
        encoding: 'base64'
      });

      tree.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobResponse.data.sha
      });
    }

    // Create new tree
    const treeResponse = await octokit.rest.git.createTree({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      base_tree: currentCommit.data.tree.sha,
      tree: tree
    });

    // Create commit
    const commitResponse = await octokit.rest.git.createCommit({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      message: message,
      tree: treeResponse.data.sha,
      parents: [currentSha]
    });

    // Update branch reference
    await octokit.rest.git.updateRef({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      ref: `heads/${branchName}`,
      sha: commitResponse.data.sha
    });

    res.json({ success: true, data: commitResponse.data });
  } catch (error) {
    console.error('Error creating commit:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/github/pull-request', async (req, res) => {
  const { title, body, head, base } = req.body;
  
  if (!process.env.GITHUB_TOKEN) {
    return res.status(400).json({ error: 'GitHub token not configured' });
  }

  if (!process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
    return res.status(400).json({ error: 'GitHub repository owner/repo not configured' });
  }

  try {
    const response = await octokit.rest.pulls.create({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      title: title,
      body: body,
      head: head,
      base: base || 'main'
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Error creating pull request:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/github/latest-sha/:branchName', async (req, res) => {
  const { branchName } = req.params;
  
  if (!process.env.GITHUB_TOKEN) {
    return res.status(400).json({ error: 'GitHub token not configured' });
  }

  if (!process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
    return res.status(400).json({ error: 'GitHub repository owner/repo not configured' });
  }

  try {
    const response = await octokit.rest.git.getRef({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      ref: `heads/${branchName}`
    });

    res.json({ success: true, sha: response.data.object.sha });
  } catch (error) {
    console.error('Error getting latest SHA:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Static File Server ---
app.use('/processed_files', express.static(path.join(__dirname, 'processed_files')));

// --- Server Start ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
