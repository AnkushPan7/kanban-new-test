// Service to trigger README generation via AI backend
import axios from 'axios';

// Backend URL - default to port 5000 where the backend server runs
const BACKEND_URL =  'http://localhost:3001/api';

export const generateReadme = async (repoUrl) => {
  if (!repoUrl) throw new Error('repoUrl is required');
  
  try {
    console.log(`Generating README for repository: ${repoUrl}`);
    const res = await axios.post(`${BACKEND_URL}/readme/generate`, { repoUrl });
    console.log('README generation response:', res.data);
    return res.data;
  } catch (error) {
    console.error('README generation failed:', error);
    throw new Error(error.response?.data?.details || error.message || 'README generation failed');
  }
};

export default {
  generateReadme,
};

