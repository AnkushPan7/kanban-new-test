import axios from 'axios';

const API_URL = 'http://localhost:5000/api/github';

export const createBranch = async (branchName, sha) => {
  return axios.post(`${API_URL}/branch`, { branchName, sha });
};

export const commitChanges = async (branchName, message, files) => {
  return axios.post(`${API_URL}/commit`, { branchName, message, files });
};

export const createPullRequest = async (title, body, head, base) => {
  return axios.post(`${API_URL}/pull-request`, { title, body, head, base });
};

export const assignReviewer = async (pullNumber, reviewers) => {
  return axios.post(`${API_URL}/assign-reviewer`, { pullNumber, reviewers });
};

export const getLatestSha = async (branchName) => {
  return axios.get(`${API_URL}/latest-sha/${branchName}`);
};
