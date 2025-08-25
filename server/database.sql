-- Create the tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  tags TEXT,
  dueDate TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create the columns table
CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  position INTEGER NOT NULL
);

-- Insert default columns
INSERT OR IGNORE INTO columns (id, title, position) VALUES ('todo', 'To Do', 0);
INSERT OR IGNORE INTO columns (id, title, position) VALUES ('inprogress', 'In Progress', 1);
INSERT OR IGNORE INTO columns (id, title, position) VALUES ('done', 'Done', 2);