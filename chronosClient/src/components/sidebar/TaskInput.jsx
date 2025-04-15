import React, { useState, useRef } from 'react';
import './TaskInput.css';

const TaskInput = ({ onAddTask, activeCategory, categoryCount, categoryIcon }) => {
  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onAddTask(inputValue);
      setInputValue('');
    }
  };

  const handleComposeClick = () => {
    setIsComposing(true);
  };

  return (
    <div className="task-input-container">
      <div className="category-header">
        <div className="category-title-container">
          {categoryIcon && <span className="category-header-icon">{categoryIcon}</span>}
          <span className="category-title">{activeCategory}</span>
        </div>
        {categoryCount !== undefined && (
          <div className="category-count-container">
            <span className="category-count">{categoryCount}</span>
            <button 
              className="add-task-button"
              onClick={(e) => {
                e.preventDefault();
                inputRef.current.focus();
              }}
            >+</button>
          </div>
        )}
      </div>
      <form className="task-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="new meeting @ 2pm"
          className="task-input-field"
        />
        <span className="keyboard-shortcut">N</span>
      </form>
    </div>
  );
};

export default TaskInput;
