// src/services/indexingService.js

let files = [];
let files_indexed = false;
let indexing_in_progress = false;

const ignored_extensions = ['.DS_Store', '.env', 'sourcemap', 'png', 'jpeg', 'jpg', 'gif', 'svg', 'ico', 'webmanifest', 'wasm', 'woff', 'woff2', 'eot', 'ttf', 'otf', 'mp4', 'webm', 'ogg', 'mp3', 'wav', 'flac', 'aac'];
const ignored_folders = ['node_modules', '.git', '.vscode', 'dist', 'build', 'coverage', 'public'];

// Parse GitHub URL to extract owner and repo
const parseGithubUrl = (url) => {
  const githubRegex = /github\.com\/([^\/]+)\/([^\/]+)/;
  const match = url.match(githubRegex);
  if (match) {
    return {
      owner: match[1],
      repo: match[2].replace('.git', '')
    };
  }
  return null;
};

// Index files from local API
const indexFiles = async () => {
  indexing_in_progress = true;
  try {
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
    const response = await fetch(`${API_BASE_URL}/files`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Response is not JSON");
    }
    
    let all_files = await response.json();

    all_files = all_files.filter(file => !ignored_extensions.some(ext => file.endsWith(ext)));
    all_files = all_files.filter(file => !ignored_folders.some(folder => file.includes(folder)));

    files = all_files;
    files_indexed = true;
  } catch (e) {
    console.error('Error indexing files:', e);
  } finally {
    indexing_in_progress = false;
  }
};

// Index files from GitHub repository
const indexGithubRepo = async (githubUrl, branch = 'main') => {
  indexing_in_progress = true;
  try {
    const repoInfo = parseGithubUrl(githubUrl);
    if (!repoInfo) {
      throw new Error('Invalid GitHub URL format');
    }

    // Use GitHub API to fetch repository tree
    const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${branch}?recursive=1`;
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        // Add Authorization header if GitHub token is available
        ...(process.env.REACT_APP_GITHUB_TOKEN && {
          'Authorization': `token ${process.env.REACT_APP_GITHUB_TOKEN}`
        })
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract file paths from GitHub tree
    let all_files = data.tree
      .filter(item => item.type === 'blob') // Only files, not directories
      .map(item => item.path);

    // Apply filters
    all_files = all_files.filter(file => !ignored_extensions.some(ext => file.endsWith(ext)));
    all_files = all_files.filter(file => !ignored_folders.some(folder => file.includes(folder)));

    files = all_files.map(file => ({
      path: file,
      source: 'github',
      repoUrl: githubUrl,
      branch: branch
    }));
    
    files_indexed = true;
  } catch (e) {
    console.error('Error indexing GitHub repository:', e);
    throw e;
  } finally {
    indexing_in_progress = false;
  }
};

// Get file content from GitHub
const getGithubFileContent = async (githubUrl, filePath, branch = 'main') => {
  const repoInfo = parseGithubUrl(githubUrl);
  if (!repoInfo) {
    throw new Error('Invalid GitHub URL format');
  }

  const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${filePath}?ref=${branch}`;
  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      ...(process.env.REACT_APP_GITHUB_TOKEN && {
        'Authorization': `token ${process.env.REACT_APP_GITHUB_TOKEN}`
      })
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error! status: ${response.status}`);
  }

  const data = await response.json();
  
  // Decode base64 content
  return atob(data.content);
};

export {
  files,
  files_indexed,
  indexFiles,
  indexing_in_progress,
  indexGithubRepo,
  getGithubFileContent,
  parseGithubUrl
};