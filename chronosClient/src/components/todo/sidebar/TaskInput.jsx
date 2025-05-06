import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import './TaskInput.css';

const TaskInput = ({ onAddTask, activeCategory, categoryCount, categoryIcon, isEditable = false, showNewTaskInput = true, autoFocus = false, showAddButton = true, showCategoryHeader = true }) => {
  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [categoryNameEdit, setCategoryNameEdit] = useState(activeCategory);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [currentIcon, setCurrentIcon] = useState(categoryIcon);
  const inputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const emojiPickerRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

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

  const toggleEmojiPicker = (e) => {
    e.stopPropagation();
    setShowEmojiPicker(!showEmojiPicker);
  };

  const handleEmojiSelect = (emoji) => {
    setCurrentIcon(emoji.native);
    setShowEmojiPicker(false);
    // Here you would also update the category icon in your context
    // For now, we'll just update the local state
  };

  const handleCategoryEdit = () => {
    setIsEditingCategory(true);
    setCurrentIcon(categoryIcon); // Ensure current icon is set when editing
    setTimeout(() => {
      if (categoryInputRef.current) {
        categoryInputRef.current.focus();
      }
    }, 10);
  };

  const saveCategoryEdit = () => {
    // Here you would update the category name and icon in your context
    // For example, you could call a function like:
    // updateCategory(activeCategory, categoryNameEdit, currentIcon);
    
    // For now, we'll just update the local state
    setIsEditingCategory(false);
  };

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="task-input-container">
      {showCategoryHeader && (
        <div className="category-header">
          <div className="category-title-container">
            {isEditable && isEditingCategory ? (
              <div className="emoji-picker-wrapper">
                <button 
                  type="button"
                  className="emoji-button"
                  onClick={toggleEmojiPicker}
                >
                  {currentIcon}
                </button>
                {showEmojiPicker && ReactDOM.createPortal(
                  <>
                    <div className="emoji-picker-backdrop" onClick={() => setShowEmojiPicker(false)}></div>
                    <div className="emoji-picker-container" ref={emojiPickerRef}>
                      <Picker
                        data={data}
                        onEmojiSelect={handleEmojiSelect}
                        theme="light"
                        previewPosition="none"
                        skinTonePosition="none"
                        emojiSize={20}
                      />
                    </div>
                  </>,
                  document.body
                )}
              </div>
            ) : (
              categoryIcon && <span className="category-header-icon">{categoryIcon}</span>
            )}
            
            {isEditable && isEditingCategory ? (
              <input
                ref={categoryInputRef}
                type="text"
                value={categoryNameEdit}
                onChange={(e) => setCategoryNameEdit(e.target.value)}
                className="category-title-edit"
                onBlur={saveCategoryEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveCategoryEdit();
                  if (e.key === 'Escape') {
                    setCategoryNameEdit(activeCategory);
                    setIsEditingCategory(false);
                  }
                }}
              />
            ) : (
              <span className="category-title">{activeCategory}</span>
            )}
          </div>
          <div className="category-count-container">
            {categoryCount !== undefined && <span className="category-count">{categoryCount}</span>}
            {showAddButton && (
              <button 
                className="add-task-button"
                onClick={(e) => {
                  e.preventDefault();
                  inputRef.current.focus();
                }}
              >+</button>
            )}
            {isEditable && !isEditingCategory && (
              <button 
                className="edit-category-button"
                onClick={handleCategoryEdit}
                style={{ marginLeft: '8px' }}
              >✎</button>
            )}
          </div>
        </div>
      )}
      {showNewTaskInput && (
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
      )}
    </div>
  );
};

export default TaskInput;
