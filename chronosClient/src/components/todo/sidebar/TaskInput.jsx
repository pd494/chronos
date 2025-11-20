import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import './TaskInput.css';
import { useTaskContext } from '../../../context/TaskContext';

const TaskInput = ({
  onAddTask,
  activeCategory,
  categoryCount,
  categoryIcon,
  isEditable = false,
  showNewTaskInput = true,
  autoFocus = false,
  showAddButton = true,
  showCategoryHeader = true,
  placeholder = 'new meeting @ 2pm',
  onCategoryRenamed = () => {}
}) => {
  const { updateCategory, categories } = useTaskContext();
  const [inputValue, setInputValue] = useState('');
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [categoryNameEdit, setCategoryNameEdit] = useState(activeCategory);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [currentIcon, setCurrentIcon] = useState(categoryIcon);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const inputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const colorPickerRef = useRef(null);

  const CATEGORY_COLORS = [
    '#1761C7', '#FF3B30', '#34C759', '#FF9500',
    '#AF52DE', '#FFD60A', '#00C7BE', '#FF2D55'
  ]

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    setCategoryNameEdit(activeCategory);
  }, [activeCategory, categoryIcon]);

  const activeCategoryColor = useMemo(() => {
    const active = categories.find(cat => cat.name === activeCategory);
    const fromIcon = active?.icon;
    if (typeof fromIcon === 'string' && fromIcon.startsWith('#')) return fromIcon;
    if (typeof active?.color === 'string' && active.color.startsWith('#')) return active.color;
    if (typeof categoryIcon === 'string' && categoryIcon.startsWith('#')) return categoryIcon;
    return '#1761C7';
  }, [categories, activeCategory, categoryIcon]);

  useEffect(() => {
    setCurrentIcon(activeCategoryColor);
  }, [activeCategoryColor]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onAddTask(inputValue);
      setInputValue('');
    }
  };

  const toggleEmojiPicker = (e) => {
    e.stopPropagation();
    setShowEmojiPicker(!showEmojiPicker);
  };

  const toggleColorPicker = (e) => {
    e.stopPropagation();
    setShowColorPicker(!showColorPicker);
  };

  const handleEmojiSelect = (emoji) => {
    setCurrentIcon(emoji.native);
    setShowEmojiPicker(false);
    // Here you would also update the category icon in your context
    // For now, we'll just update the local state
  };

  const handleCategoryEdit = () => {
    setIsEditingCategory(true);
    setCurrentIcon(categoryIcon); 
    setTimeout(() => {
      if (categoryInputRef.current) {
        categoryInputRef.current.focus();
      }
    }, 10);
  };

  const saveCategoryEdit = () => {
    const trimmed = categoryNameEdit.trim();
    if (!trimmed) {
      setCategoryNameEdit(activeCategory);
      setIsEditingCategory(false);
      return;
    }

    const category = categories.find(cat => cat.name === activeCategory);
    if (category) {
      const payload = { name: trimmed };
      if (typeof currentIcon === 'string' && currentIcon.startsWith('#')) {
        payload.color = currentIcon;
      }
      if (trimmed !== activeCategory || payload.color) {
        updateCategory(category.id, payload);
      }
      if (trimmed !== activeCategory) {
        onCategoryRenamed(activeCategory, trimmed);
      }
    }
    setCategoryNameEdit(trimmed);
    setIsEditingCategory(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
        setShowColorPicker(false);
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
            {isEditable ? (
              <div className="category-color-wrapper" ref={colorPickerRef}>
                <button
                  type="button"
                  className="category-color-button"
                  style={{
                    backgroundColor:
                      (typeof currentIcon === 'string' && currentIcon.startsWith('#'))
                        ? currentIcon
                        : activeCategoryColor
                  }}
                  onClick={toggleColorPicker}
                />
                {showColorPicker && (
                  <div className="category-color-popover compact">
                    {CATEGORY_COLORS.map(color => (
                      <button
                        type="button"
                        key={color}
                        className={`color-swatch ${currentIcon === color ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentIcon(color);
                          setShowColorPicker(false);
                          const category = categories.find(cat => cat.name === activeCategory);
                          if (category && category.color !== color) {
                            updateCategory(category.id, { color });
                          }
                        }}
                      />
                    ))}
                  </div>
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
            placeholder={placeholder}
            className="task-input-field"
          />
          <span className="keyboard-shortcut">N</span>
        </form>
      )}
    </div>
  );
};

export default TaskInput;
