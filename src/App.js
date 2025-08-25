import React, { useState, useEffect } from 'react';
import Board from './components/Board';
import './App.css';
import { indexFiles } from './services/indexingService';

const App = () => {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    indexFiles();
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className={`App ${theme}`}>
      <Board theme={theme} toggleTheme={toggleTheme} />
    </div>
  );
};

export default App;