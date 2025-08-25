import React from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import Card from './Card';

const Column = ({ column, cards, colId, onNext, onEdit, onDelete, onComplete, onProcessWithAI }) => (
  <div className="kanban-column" style={{ borderTopColor: `var(--${column.id}-priority)` }}>
    <div className="kanban-column-header">
      <h2 className="kanban-column-title">{column.title}</h2>
      <span className="kanban-column-count">{cards.length}</span>
    </div>
    <Droppable droppableId={colId}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className="kanban-column-cards"
        >
          {cards.map((card, idx) => (
            <Draggable key={card.id} draggableId={card.id} index={idx}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                >
                  <Card 
                    card={card} 
                    onNext={onNext} 
                    onEdit={() => onEdit(card)} 
                    onDelete={onDelete}
                    onComplete={onComplete}
                    onProcessWithAI={onProcessWithAI}
                  />
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  </div>
);

export default Column;
