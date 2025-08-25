# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React-based Kanban board application built with Create React App. The app features a 3-column layout (To Do, In Progress, Done) with drag-and-drop functionality, task management, and theme switching.

## Development Commands

- `npm start` - Start development server on http://localhost:3000
- `npm test` - Run tests in watch mode  
- `npm run build` - Build for production
- `npm run eject` - Eject from Create React App (one-way operation)

## Architecture

### Core Structure
- **State Management**: Custom hook `useKanban` in `src/hooks/useKanban.js` manages all board state
- **Drag & Drop**: Uses `@hello-pangea/dnd` library for card movement between columns
- **Components**: Modular component structure in `src/components/`
- **Styling**: CSS classes with Tailwind CSS support (configured in devDependencies)

### Key Components
- `Board.js` - Main board container with search/filtering and drag-drop context
- `Column.js` - Individual column rendering 
- `Card.js` - Task card display with priority styling and date formatting
- `TaskModal.js` - Modal for creating/editing tasks with form validation
- `useKanban.js` - Custom hook managing board data and task operations

### Data Structure
The kanban state follows this pattern:
```javascript
{
  columnOrder: ['todo', 'inprogress', 'done'],
  columns: { [columnId]: { id, title, cardIds } },
  cards: { [cardId]: { id, title, description, priority, tags, dueDate } }
}
```

### Key Features
- **Task Operations**: Add, edit, move cards between columns
- **Filtering**: Search by title and filter by tags
- **Theme Support**: Light/dark theme toggle functionality  
- **AI Integration**: Service for code suggestions via `src/services/aiService.js`
- **Date Handling**: Uses `dayjs` library for date formatting

### Dependencies Notes
- Uses `@hello-pangea/dnd` (not `react-beautiful-dnd`) for drag-drop
- `dayjs` for date operations
- `lodash` for debouncing search functionality
- No additional UI library - uses custom CSS classes

## Testing
Uses React Testing Library with Jest (standard Create React App setup). Run tests with `npm test`.