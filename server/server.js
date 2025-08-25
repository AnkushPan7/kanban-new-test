const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(path.join(__dirname, 'kanban.db'));

db.serialize(() => {
  const sqlScript = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
  db.exec(sqlScript, (err) => {
    if (err) {
      console.error('Error executing SQL script:', err.message);
    } else {
      console.log('Database initialized successfully.');
    }
  });
});

app.get('/api/tasks', (req, res) => {
  const { search, tags } = req.query;
  let query = 'SELECT * FROM tasks ORDER BY createdAt DESC';
  const params = [];

  if (search || tags) {
    const conditions = [];
    if (search) {
      conditions.push('title LIKE ?');
      params.push(`%${search}%`);
    }
    if (tags) {
      conditions.push('tags LIKE ?');
      params.push(`%${tags}%`);
    }
    query = `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY createdAt DESC`;
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(task => ({
      ...task,
      tags: task.tags ? task.tags.split(',') : []
    })));
  });
});
app.get('/api/created-tasks', (req, res) => {
  db.all("SELECT * FROM tasks ORDER BY createdAt DESC", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.map(task => ({
      ...task,
      tags: task.tags ? task.tags.split(',') : []
    })));
  });
});

app.get('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({
      ...row,
      tags: row.tags ? row.tags.split(',') : []
    });
  });
});

app.post('/api/tasks', (req, res) => {
  const { title, description, status = 'todo', priority = 'medium', tags = [], dueDate, githubUrl } = req.body;
  const id = uuidv4();
  const tagsString = Array.isArray(tags) ? tags.join(',') : '';

  db.run(
    `INSERT INTO tasks (id, title, description, status, priority, tags, dueDate) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, title, description, status, priority, tagsString, dueDate],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.status(201).json({
          ...row,
          tags: row.tags ? row.tags.split(',') : []
        });

        // Trigger AI agent
        if (githubUrl && description) {
            axios.post('http://localhost:3001/api/tasks', {
                repoUrl: githubUrl,
                taskDescription: description
            }).catch(err => {
                // Log the error, but don't block the main response
                console.error('Error calling AI agent:', err.message);
            });
        }
      });
    }
  );
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority, tags, dueDate } = req.body;

  const fields = [];
  const params = [];

  if (title !== undefined) {
    fields.push('title = ?');
    params.push(title);
  }
  if (description !== undefined) {
    fields.push('description = ?');
    params.push(description);
  }
  if (status !== undefined) {
    fields.push('status = ?');
    params.push(status);
  }
  if (priority !== undefined) {
    fields.push('priority = ?');
    params.push(priority);
  }
  if (tags !== undefined) {
    fields.push('tags = ?');
    params.push(Array.isArray(tags) ? tags.join(',') : tags);
  }
  if (dueDate !== undefined) {
    fields.push('dueDate = ?');
    params.push(dueDate);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  fields.push('updatedAt = CURRENT_TIMESTAMP');
  const query = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`;
  params.push(id);

  db.run(
    query,
    params,
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      
      db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({
          ...row,
          tags: row.tags ? row.tags.split(',') : []
        });
      });
    }
  );
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    res.json({ message: 'Task deleted successfully' });
  });
});

app.get('/api/columns', (req, res) => {
  db.all('SELECT * FROM columns ORDER BY position', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/files', (req, res) => {
  const directoryPath = path.join(__dirname, '..'); // This points to the project root
  fs.readdir(directoryPath, { recursive: true }, (err, files) => {
    if (err) {
      res.status(500).json({ error: 'Unable to scan directory: ' + err });
      return;
    }
    // Filter out directories and return only file paths relative to the project root
    const filePaths = files.filter(file => fs.statSync(path.join(directoryPath, file)).isFile())
                           .map(file => path.relative(directoryPath, path.join(directoryPath, file)).replace(/\\/g, '/'));
    res.json(filePaths);
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});