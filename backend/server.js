require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const { Octokit } = require('@octokit/rest');
const simpleGit = require('simple-git');

// --- Setup ---
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json());

// --- AI Setup ---
// Gemini AI Setup
if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY is not set in the .env file.');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Groq AI Setup for README generation
let groq = null;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
  console.log('✅ Groq API initialized for README generation');
} else {
  console.warn('WARNING: GROQ_API_KEY is not set. README generation will use Gemini fallback.');
}

// --- Directory Setup ---
const REPOS_DIR = path.join(__dirname, 'repos');
const TEMP_DIR = path.join(__dirname, 'temp_clones');
const GENERATED_READMES_DIR = path.join(__dirname, 'generated_readmes');
fs.mkdirSync(REPOS_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(GENERATED_READMES_DIR, { recursive: true });

// --- GitHub Setup ---
if (!process.env.GITHUB_TOKEN) {
  console.error('WARNING: GITHUB_TOKEN is not set in the .env file. GitHub functionality will be disabled.');
}
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// --- AI File Processing Endpoint ---
app.post('/api/ai/process-file', upload.single('file'), async (req, res) => {
  const { description, repoContext, multiFile } = req.body;
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

    console.log('--- Calling Enhanced Gemini API ---');
    const result = await processWithAI(fileContent, description, repoContext, multiFile);
    const modifiedContent = result.content || result;
    
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

// --- Repository Analysis Functions ---
async function analyzeRepository(owner, repo, branch = 'main') {
  try {
    const structure = await getRepoStructure(owner, repo, branch);
    const keyFiles = await getKeyFiles(owner, repo, branch, structure);

    const analysis = {
      structure: structure,
      keyFiles: keyFiles,
      framework: detectFramework(keyFiles),
      language: detectLanguage(keyFiles),
      dependencies: await getDependencies(owner, repo, branch),
      timestamp: new Date().toISOString()
    };

    return analysis;
  } catch (error) {
    console.error('Error in analyzeRepository:', error);
    throw error;
  }
}

async function getRepoStructure(owner, repo, branch) {
  const response = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: '',
    ref: branch
  });

  const structure = {
    files: [],
    directories: []
  };

  for (const item of response.data) {
    if (item.type === 'file') {
      structure.files.push({
        name: item.name,
        path: item.path,
        size: item.size
      });
    } else if (item.type === 'dir') {
      structure.directories.push({
        name: item.name,
        path: item.path
      });
    }
  }

  return structure;
}

async function getKeyFiles(owner, repo, branch, structure) {
  const keyFiles = [];
  const importantFiles = [
    'package.json', 'package-lock.json', 'yarn.lock',
    'src/App.js', 'src/App.jsx', 'src/App.ts', 'src/App.tsx',
    'src/index.js', 'src/index.jsx', 'src/index.ts', 'src/index.tsx',
    'src/App.css', 'src/index.css',
    'public/index.html', 'index.html',
    'README.md', 'README.txt'
  ];

  for (const fileName of importantFiles) {
    try {
      const file = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: fileName,
        ref: branch
      });

      if (file.data.content) {
        keyFiles.push({
          name: fileName,
          content: Buffer.from(file.data.content, 'base64').toString('utf-8'),
          encoding: file.data.encoding
        });
      }
    } catch (error) {
      // File not found, continue
      console.log(`File ${fileName} not found, skipping...`);
    }
  }

  return keyFiles;
}

function detectFramework(keyFiles) {
  const frameworks = {
    react: false,
    vue: false,
    angular: false,
    next: false,
    svelte: false
  };

  for (const file of keyFiles) {
    const content = file.content.toLowerCase();

    if (content.includes('react')) frameworks.react = true;
    if (content.includes('vue')) frameworks.vue = true;
    if (content.includes('@angular')) frameworks.angular = true;
    if (content.includes('next')) frameworks.next = true;
    if (content.includes('svelte')) frameworks.svelte = true;
  }

  return Object.keys(frameworks).filter(f => frameworks[f]);
}

function detectLanguage(keyFiles) {
  const languages = { javascript: false, typescript: false, python: false, java: false };

  for (const file of keyFiles) {
    if (file.name.endsWith('.ts') || file.name.endsWith('.tsx')) languages.typescript = true;
    if (file.name.endsWith('.js') || file.name.endsWith('.jsx')) languages.javascript = true;
    if (file.name.endsWith('.py')) languages.python = true;
    if (file.name.endsWith('.java')) languages.java = true;

    const content = file.content.toLowerCase();
    if (content.includes('typescript') || content.includes('interface') || content.includes(': string')) {
      languages.typescript = true;
    }
  }

  return Object.keys(languages).filter(l => languages[l]);
}

async function getDependencies(owner, repo, branch) {
  try {
    const packageJson = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: 'package.json',
      ref: branch
    });

    if (packageJson.data.content) {
      const content = JSON.parse(Buffer.from(packageJson.data.content, 'base64').toString());
      return {
        dependencies: content.dependencies || {},
        devDependencies: content.devDependencies || {},
        scripts: content.scripts || {}
      };
    }
  } catch (error) {
    console.log('No package.json found');
  }

  return { dependencies: {}, devDependencies: {}, scripts: {} };
}

async function processWithAI(content, instruction, repoContext = null, multiFile = false) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro"});

    // Enhanced prompt for complex feature implementations
    const prompt = `You are an expert full-stack developer and software architect. Your task is to analyze and implement complex features in a codebase based on the user's detailed task description.

## Your Capabilities:
- Implement complete features from scratch (dark mode, authentication, dashboards, etc.)
- Modify multiple files as needed for complex functionality
- Understand project architecture and dependencies
- Follow best practices for the specific technology stack
- Create proper file structures and organization
- Handle both simple and complex modifications

## Input Analysis:
Current File Content:
---
${content}
---

User Task: "${instruction}"

${repoContext ? `Repository Context:
---
${repoContext}
---
` : ''}

## Output Format:

${multiFile ?
`IMPORTANT: This is a MULTI-FILE request. You should output a JSON array with the following structure:

[
  {
    "path": "relative/file/path.js",
    "content": "complete file content here...",
    "reason": "Brief explanation of changes"
  },
  {
    "path": "relative/other/file.css",
    "content": "complete file content here...",
    "reason": "Brief explanation of changes"
  }
]

Each object represents a file that needs to be created or modified.` :

`For single file modifications, output ONLY the complete updated file content without any explanations or markdown formatting.`}

## Implementation Guidelines:
1. **Complex Features**: For features like dark mode, implement complete CSS variables, theme switching logic, state management, and UI updates
2. **Multiple Steps**: Break down complex tasks into logical file modifications
3. **Best Practices**: Use proper naming conventions, error handling, and clean code structure
4. **Framework Awareness**: Adapt to React, Vue, Angular, or vanilla JavaScript as appropriate
5. **Complete Implementation**: Don't omit any necessary imports, functions, or configuration

${multiFile ? 'Return ONLY valid JSON array with complete file implementations.' : 'Return ONLY the complete updated file content as plain text.'}`;

    console.log('--- Enhanced Prompt sent to Gemini ---');
    console.log(prompt);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    if (multiFile) {
      try {
        // Parse JSON response for multi-file changes
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return {
            content: parsed,
            affectedFiles: parsed.map(f => f.path),
            isMultiFile: true
          };
        }
      } catch (parseError) {
        console.error('Failed to parse multi-file JSON response:', parseError);
        console.log('Raw response:', text);
        // Fallback: return as single file if JSON parsing fails
        return text;
      }
    }

    return text;

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw new Error('Failed to process text with AI.');
  }
}

// --- Repository Analysis Endpoints ---
app.post('/api/repo/analyze', async (req, res) => {
  const { repoUrl, targetBranch = 'main' } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ error: 'Repository URL is required' });
  }

  try {
    const [owner, repo] = repoUrl.replace('https://github.com/', '').split('/');

    if (!owner || !repo) {
      return res.status(400).json({ error: 'Invalid repository URL format' });
    }

    // Get repository structure
    const repoAnalysis = await analyzeRepository(owner, repo, targetBranch);
    res.json({
      success: true,
      analysis: repoAnalysis,
      repository: { owner, repo, branch: targetBranch }
    });

  } catch (error) {
    console.error('Error analyzing repository:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/repo/structure/:owner/:repo', async (req, res) => {
  const { owner, repo } = req.params;
  const { branch = 'main' } = req.query;

  try {
    const structure = await getRepoStructure(owner, repo, branch);
    res.json({ success: true, structure });
  } catch (error) {
    console.error('Error getting repository structure:', error);
    res.status(500).json({ error: error.message });
  }
});

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

// --- README Generation Functions ---
async function cloneRepositoryToTemp(repoUrl) {
  const repoName = path.basename(repoUrl, '.git');
  const timestamp = Date.now();
  const tempRepoPath = path.join(TEMP_DIR, `${repoName}_${timestamp}`);
  
  // Clean up any existing temp directory
  try {
    await fs.promises.rm(tempRepoPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore if directory doesn't exist
  }

  const git = simpleGit();
  console.log(`Cloning repository to temp: ${repoUrl}`);
  await git.clone(repoUrl, tempRepoPath);
  console.log(`Repository cloned to temp: ${tempRepoPath}`);
  
  return tempRepoPath;
}

async function cleanupTempDirectory(tempPath) {
  try {
    console.log(`Cleaning up temp directory: ${tempPath}`);
    await fs.promises.rm(tempPath, { recursive: true, force: true });
    console.log(`Temp directory cleaned up successfully`);
  } catch (error) {
    console.error(`Error cleaning up temp directory: ${error.message}`);
  }
}

async function analyzeCodebaseStructure(repoPath) {
  const analysis = {
    structure: { files: [], directories: [] },
    keyFiles: [],
    framework: [],
    language: [],
    dependencies: {},
    scripts: {},
    codeStats: {
      totalFiles: 0,
      totalLines: 0,
      fileTypes: {}
    }
  };

  try {
    const { glob } = require('glob');
    const files = await glob('**/*', { 
      cwd: repoPath, 
      ignore: ['node_modules/**', '.git/**', '*.log', 'dist/**', 'build/**'], 
      nodir: true 
    });

    analysis.codeStats.totalFiles = files.length;

    for (const file of files) {
      const filePath = path.join(repoPath, file);
      const ext = path.extname(file);
      
      // Count file types
      analysis.codeStats.fileTypes[ext] = (analysis.codeStats.fileTypes[ext] || 0) + 1;

      // Add to structure
      if (file.includes('/')) {
        const dir = path.dirname(file);
        if (!analysis.structure.directories.includes(dir)) {
          analysis.structure.directories.push(dir);
        }
      }
      analysis.structure.files.push(file);

      // Process key files
      const fileName = path.basename(file);
      const keyFiles = [
        'package.json', 'package-lock.json', 'yarn.lock', 'requirements.txt', 'pom.xml',
        'README.md', 'README.txt', 'LICENSE', 'CONTRIBUTING.md',
        'src/App.js', 'src/App.jsx', 'src/App.ts', 'src/App.tsx',
        'src/index.js', 'src/index.jsx', 'src/index.ts', 'src/index.tsx',
        'src/main.js', 'src/main.ts', 'main.py', 'app.py', 'index.html',
        '.gitignore', 'Dockerfile', 'docker-compose.yml'
      ];

      if (keyFiles.includes(file) || keyFiles.includes(fileName)) {
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          analysis.keyFiles.push({
            name: file,
            content: content.substring(0, 5000), // Limit content size
            size: content.length
          });

          // Count lines
          analysis.codeStats.totalLines += content.split('\n').length;
        } catch (error) {
          console.log(`Could not read file ${file}: ${error.message}`);
        }
      }
    }

    // Detect framework and language
    analysis.framework = detectFramework(analysis.keyFiles);
    analysis.language = detectLanguage(analysis.keyFiles, analysis.structure.files);
    analysis.dependencies = extractDependencies(analysis.keyFiles);

  } catch (error) {
    console.error('Error analyzing codebase:', error);
  }

  return analysis;
}

function detectFramework(keyFiles) {
  const frameworks = [];
  
  for (const file of keyFiles) {
    const content = file.content.toLowerCase();
    const filename = file.name.toLowerCase();
    
    if (content.includes('"react"') || content.includes('import react')) frameworks.push('React');
    if (content.includes('"vue"') || content.includes('vue')) frameworks.push('Vue.js');
    if (content.includes('@angular') || content.includes('angular')) frameworks.push('Angular');
    if (content.includes('"next"') || content.includes('next.js')) frameworks.push('Next.js');
    if (content.includes('"nuxt"') || content.includes('nuxt')) frameworks.push('Nuxt.js');
    if (content.includes('"svelte"') || content.includes('svelte')) frameworks.push('Svelte');
    if (content.includes('express') || content.includes('"express"')) frameworks.push('Express.js');
    if (content.includes('flask') || filename.includes('app.py')) frameworks.push('Flask');
    if (content.includes('django') || content.includes('manage.py')) frameworks.push('Django');
    if (content.includes('spring') || filename.includes('pom.xml')) frameworks.push('Spring Boot');
  }
  
  return [...new Set(frameworks)]; // Remove duplicates
}

function detectLanguage(keyFiles, allFiles) {
  const languages = [];
  const fileExtensions = {};
  
  // Count file extensions
  allFiles.forEach(file => {
    const ext = path.extname(file);
    fileExtensions[ext] = (fileExtensions[ext] || 0) + 1;
  });
  
  // Determine primary languages based on file counts
  if (fileExtensions['.js'] || fileExtensions['.jsx']) languages.push('JavaScript');
  if (fileExtensions['.ts'] || fileExtensions['.tsx']) languages.push('TypeScript');
  if (fileExtensions['.py']) languages.push('Python');
  if (fileExtensions['.java']) languages.push('Java');
  if (fileExtensions['.cpp'] || fileExtensions['.c']) languages.push('C/C++');
  if (fileExtensions['.cs']) languages.push('C#');
  if (fileExtensions['.php']) languages.push('PHP');
  if (fileExtensions['.rb']) languages.push('Ruby');
  if (fileExtensions['.go']) languages.push('Go');
  if (fileExtensions['.rs']) languages.push('Rust');
  
  return languages;
}

function extractDependencies(keyFiles) {
  const dependencies = { dependencies: {}, devDependencies: {}, scripts: {} };
  
  for (const file of keyFiles) {
    if (file.name === 'package.json') {
      try {
        const packageData = JSON.parse(file.content);
        dependencies.dependencies = packageData.dependencies || {};
        dependencies.devDependencies = packageData.devDependencies || {};
        dependencies.scripts = packageData.scripts || {};
      } catch (error) {
        console.log('Error parsing package.json:', error);
      }
    }
  }
  
  return dependencies;
}

async function generateReadmeWithFallback(analysis, repoUrl) {
  // First try Groq for README generation
  try {
    if (groq) {
      const prompt = `You are an expert technical writer specializing in creating comprehensive README.md files for software repositories. Your task is to generate a professional, well-structured README based on the codebase analysis provided.
## Repository Analysis:
Repository URL: ${repoUrl}
Languages: ${analysis.language.join(', ')}
Frameworks: ${analysis.framework.join(', ')}
Total Files: ${analysis.codeStats.totalFiles}
File Types: ${JSON.stringify(analysis.codeStats.fileTypes)}
Key Dependencies: ${JSON.stringify(analysis.dependencies.dependencies)}
Scripts Available: ${JSON.stringify(analysis.dependencies.scripts)}
Key Files Found: ${analysis.keyFiles.map(f => `- ${f.name} (${f.size} bytes)`).join('\n')}
File Structure: ${analysis.structure.directories.slice(0, 10).map(dir => `- ${dir}/`).join('\n')}

## Instructions:
Create a comprehensive README.md file that includes:
1. **Project Title & Description** - Infer project name from repository structure and create a compelling description
2. **Features** - List key features based on code analysis and framework detection
3. **Technology Stack** - Detail the technologies, frameworks, and languages used
4. **Installation** - Provide clear installation instructions based on package managers and dependencies found
5. **Usage** - Include usage examples and available scripts
6. **Project Structure** - Explain the directory structure and key files
7. **API Documentation** - If applicable, document any APIs found
8. **Contributing** - Standard contributing guidelines
9. **License** - Mention license if found, otherwise suggest adding one

## Output Requirements:
- Use proper Markdown formatting
- Include badges for key technologies
- Make it professional and user-friendly
- Include code examples where appropriate
- Keep sections concise but informative
- Add emojis for better visual appeal

Generate ONLY the README.md content, no explanations:`;
      console.log('Attempting Groq-powered README generation...');
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant"
      });

      const readmeContent = completion.choices[0]?.message?.content?.trim();
      if (readmeContent) {
        console.log('✅ Groq-powered README generation successful');
        return readmeContent;
      }
    }
    
    // Fallback to Gemini if Groq is not available or failed
    console.log('Falling back to Gemini AI for README generation...');
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    
    const prompt = `You are an expert technical writer specializing in creating comprehensive README.md files for software repositories. Your task is to generate a professional, well-structured README based on the codebase analysis provided.

## Repository Analysis:
Repository URL: ${repoUrl}
Languages: ${analysis.language.join(', ')}
Frameworks: ${analysis.framework.join(', ')}
Total Files: ${analysis.codeStats.totalFiles}
File Types: ${JSON.stringify(analysis.codeStats.fileTypes)}

Key Dependencies: ${JSON.stringify(analysis.dependencies.dependencies)}
Scripts Available: ${JSON.stringify(analysis.dependencies.scripts)}

Key Files Found:
${analysis.keyFiles.map(f => `- ${f.name} (${f.size} bytes)`).join('\n')}

File Structure:
${analysis.structure.directories.slice(0, 10).map(dir => `- ${dir}/`).join('\n')}

## Instructions:
Create a comprehensive README.md file that includes:

1. **Project Title & Description** - Infer project name from repository structure and create a compelling description
2. **Features** - List key features based on code analysis and framework detection
3. **Technology Stack** - Detail the technologies, frameworks, and languages used
4. **Installation** - Provide clear installation instructions based on package managers and dependencies found
5. **Usage** - Include usage examples and available scripts
6. **Project Structure** - Explain the directory structure and key files
7. **API Documentation** - If applicable, document any APIs found
8. **Contributing** - Standard contributing guidelines
9. **License** - Mention license if found, otherwise suggest adding one

## Output Requirements:
- Use proper Markdown formatting
- Include badges for key technologies
- Make it professional and user-friendly
- Include code examples where appropriate
- Keep sections concise but informative
- Add emojis for better visual appeal

Generate ONLY the README.md content, no explanations:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const readmeContent = response.text().trim();
    
    console.log('✅ Gemini fallback README generation successful');
    return readmeContent;
    
  } catch (error) {
    console.error('❌ AI generation failed, using template fallback method:', error.message);
    
    // If both AI methods fail, generate a basic README using template
    return generateBasicReadme(analysis, repoUrl);
  }
}

function generateBasicReadme(analysis, repoUrl) {
  const repoName = repoUrl.split('/').pop().replace('.git', '');
  const languages = analysis.language.join(', ') || 'Various';
  const frameworks = analysis.framework.join(', ') || 'Standard';
  
  // Create technology badges
  const badges = [];
  if (analysis.language.includes('JavaScript')) badges.push('![JavaScript](https://img.shields.io/badge/-JavaScript-F7DF1E?logo=javascript&logoColor=black)');
  if (analysis.language.includes('TypeScript')) badges.push('![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)');
  if (analysis.language.includes('Python')) badges.push('![Python](https://img.shields.io/badge/-Python-3776AB?logo=python&logoColor=white)');
  if (analysis.framework.includes('React')) badges.push('![React](https://img.shields.io/badge/-React-61DAFB?logo=react&logoColor=black)');
  if (analysis.framework.includes('Vue.js')) badges.push('![Vue.js](https://img.shields.io/badge/-Vue.js-4FC08D?logo=vue.js&logoColor=white)');
  if (analysis.framework.includes('Express.js')) badges.push('![Express.js](https://img.shields.io/badge/-Express.js-000000?logo=express&logoColor=white)');
  
  // Generate installation commands based on detected package managers
  let installCommands = [];
  const hasPackageJson = analysis.keyFiles.some(f => f.name === 'package.json');
  const hasYarnLock = analysis.keyFiles.some(f => f.name === 'yarn.lock');
  const hasRequirementsTxt = analysis.keyFiles.some(f => f.name === 'requirements.txt');
  
  if (hasPackageJson) {
    if (hasYarnLock) {
      installCommands.push('yarn install');
    } else {
      installCommands.push('npm install');
    }
  }
  if (hasRequirementsTxt) {
    installCommands.push('pip install -r requirements.txt');
  }
  
  // Extract available scripts
  const scripts = Object.keys(analysis.dependencies.scripts || {});
  const runCommands = scripts.map(script => hasYarnLock ? `yarn ${script}` : `npm run ${script}`);
  
  let usageSection = '';
  if (runCommands.length > 0) {
    usageSection = `### Available Scripts

${runCommands.map(cmd => `- \`${cmd}\``).join('\n')}

### Running the Project

\`\`\`bash
${runCommands[0] || (hasPackageJson ? 'npm start' : 'python main.py')}
\`\`\``;
  } else {
    usageSection = `### Running the Project

Please refer to the project documentation for specific usage instructions.`;
  }

  const readmeContent = `# ${repoName}

${badges.length > 0 ? badges.join(' ') + '\n\n' : ''}

## 📋 Description

This is a ${frameworks} project built with ${languages}. The repository contains ${analysis.codeStats.totalFiles} files and implements various features and functionalities.

## 🚀 Features

- Modern ${languages} implementation
- ${frameworks} architecture
- Well-organized project structure
- Comprehensive file organization

## 🛠️ Technology Stack

- **Languages**: ${languages}
- **Frameworks**: ${frameworks}
- **Total Files**: ${analysis.codeStats.totalFiles}
- **File Types**: ${Object.keys(analysis.codeStats.fileTypes || {}).join(', ')}

## 📦 Installation

1. **Clone the repository:**
   \`\`\`bash
   git clone ${repoUrl}
   cd ${repoName}
   \`\`\`

2. **Install dependencies:**
   \`\`\`bash
   ${installCommands.join('\n   ')}
   \`\`\`

## 🎯 Usage

${usageSection}

## 📁 Project Structure

\`\`\`
${repoName}/
${analysis.structure.directories.slice(0, 8).map(dir => `├── ${dir}/`).join('\n')}
${analysis.keyFiles.slice(0, 5).map(file => `├── ${file.name}`).join('\n')}
\`\`\`

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (\`git checkout -b feature/AmazingFeature\`)
3. Commit your changes (\`git commit -m 'Add some AmazingFeature'\`)
4. Push to the branch (\`git push origin feature/AmazingFeature\`)
5. Open a Pull Request

## 📄 License

This project is open source. Please check the repository for license details.

## 🔗 Repository

[View on GitHub](${repoUrl})

---

*This README was automatically generated based on repository analysis.*`;

  console.log('✅ Fallback README generation completed');
  return readmeContent;
}

// --- README Generation Endpoint ---
app.post('/api/readme/generate', async (req, res) => {
  const { repoUrl } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ error: 'Repository URL is required' });
  }

  let tempRepoPath = null;

  try {
    console.log(`Starting README generation for: ${repoUrl}`);
    
    // 1. Clone the repository to temporary directory
    tempRepoPath = await cloneRepositoryToTemp(repoUrl);
    
    // 2. Analyze the codebase
    console.log('Analyzing codebase structure...');
    const analysis = await analyzeCodebaseStructure(tempRepoPath);
    
    // 3. Generate README with AI (or fallback if quota exceeded)
    console.log('Generating README...');
    const readmeContent = await generateReadmeWithFallback(analysis, repoUrl);
    
    // 4. Save README file to centralized generated_readmes directory (one per repository)
    const repoName = path.basename(repoUrl, '.git');
    const readmeFilePath = path.join(GENERATED_READMES_DIR, `${repoName}_README.md`);
    
    console.log(`Saving README to: ${readmeFilePath}`);
    await fs.promises.writeFile(readmeFilePath, readmeContent);
    
    console.log(`README generated and saved successfully: ${readmeFilePath}`);
    
    // 5. Clean up temporary cloned repository
    await cleanupTempDirectory(tempRepoPath);
    
    res.json({
      success: true,
      message: 'README generated successfully',
      readmeContent: readmeContent,
      analysis: {
        languages: analysis.language,
        frameworks: analysis.framework,
        totalFiles: analysis.codeStats.totalFiles,
        fileTypes: analysis.codeStats.fileTypes
      },
      savedPath: `/repos/${path.basename(readmeFilePath)}`,
      repoName: repoName
    });

  } catch (error) {
    console.error('README generation failed:', error);
    
    // Clean up temp directory even if there was an error
    if (tempRepoPath) {
      await cleanupTempDirectory(tempRepoPath);
    }
    
    res.status(500).json({ 
      error: 'Failed to generate README', 
      details: error.message 
    });
  }
});

// --- Static File Server ---
app.use('/processed_files', express.static(path.join(__dirname, 'processed_files')));
app.use('/repos', express.static(path.join(__dirname, 'repos')));

// --- Server Start ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
