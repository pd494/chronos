import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import Sortable from 'sortablejs';
import './CategoryTabs.css';
import { useTaskContext } from '../../../context/TaskContext';

const CATEGORY_COLORS = [
  '#3478F6',
  '#FF3B30',
  '#34C759',
  '#FF9500',
  '#AF52DE',
  '#FFD60A',
  '#00C7BE',
  '#FF2D55'
];

const PROTECTED_CATEGORY_NAMES = new Set(['Today', 'Inbox', 'Completed']);

const CategoryTabs = ({ categories, activeCategory, onCategoryChange, isCollapsed = false, isCompact = false, inHeader = false }) => {
  const { createCategory, reorderCategories, deleteCategory } = useTaskContext();
  const [truncatedTabs, setTruncatedTabs] = useState(new Set());
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3478F6');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const tabRefs = useRef({});
  const labelRefs = useRef({});
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const colorPickerRef = useRef(null);
  const contextMenuRef = useRef(null);
  
  useEffect(() => {
    const checkTruncation = () => {
      const newTruncated = new Set();
      Object.entries(labelRefs.current).forEach(([id, element]) => {
        if (element && element.scrollWidth > element.clientWidth) {
          newTruncated.add(id);
        }
      });
      setTruncatedTabs(newTruncated);
    };

    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [categories]);

  useEffect(() => {
    if (!listRef.current || isAddingCategory) return;

    const sortable = Sortable.create(listRef.current, {
      animation: 200,
      draggable: '.category-tab-horizontal[data-draggable="true"]',
      filter: '.add-category-button',
      ghostClass: 'category-tab-ghost',
      chosenClass: 'category-tab-chosen',
      dragClass: 'category-tab-drag',
      direction: 'horizontal',
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex) return;
        const orderedIds = Array.from(listRef.current.querySelectorAll('[data-category-id]'))
          .map(el => el.getAttribute('data-category-id'))
          .filter(Boolean)
          .filter(id => id !== 'add-category' && id !== 'all');
        reorderCategories(orderedIds);
      }
    });

    return () => {
      sortable.destroy();
    };
  }, [reorderCategories, categories, isAddingCategory]);

  const getCategoryColor = (category) => {
    if (category.icon && category.icon.startsWith('#')) {
      return category.icon;
    }
    switch (category.name) {
      case 'All':
        return '#666';
      case 'Inbox':
        return '#3478F6';
      case 'Today':
        return '#FF9500';
      case 'Completed':
        return '#34C759';
      default:
        return '#3478F6';
    }
  };
  
  const handleStartAddCategory = () => {
    setIsAddingCategory(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 10);
  };
  
  const handleSaveCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    createCategory(trimmed, selectedColor)
      .finally(() => {
        setNewCategoryName('');
        setSelectedColor('#3478F6');
        setIsAddingCategory(false);
      });
  };
  
  const handleCancelAddCategory = () => {
    setIsAddingCategory(false);
    setNewCategoryName('');
    setSelectedColor('#3478F6');
    setShowColorPicker(false);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveCategory();
    } else if (e.key === 'Escape') {
      handleCancelAddCategory();
    }
  };

  const toggleColorPicker = (e) => {
    e.stopPropagation();
    setShowColorPicker(!showColorPicker);
  };

  const handleColorSelect = (color) => {
    setSelectedColor(color);
    setShowColorPicker(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
        setShowColorPicker(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleContextMenu = (e, category) => {
    e.preventDefault();
    if (category.id === 'all' || PROTECTED_CATEGORY_NAMES.has(category.name)) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      category,
      x: rect.left,
      y: rect.bottom + 4
    });
  };

  return (
    <div className={`category-tabs-container ${isCompact ? 'compact' : ''} ${inHeader ? 'in-header' : ''}`} ref={tabsContainerRef}>
      <div className="category-tabs-horizontal" ref={listRef}>
        {!isAddingCategory && categories.map(category => (
          <div
            key={category.id}
            data-category-id={category.id}
            data-draggable={category.id !== 'all'}
            className={`category-tab-horizontal ${activeCategory === category.name ? 'active' : ''}`}
            onClick={() => {
              if (category.name) {
                onCategoryChange(category.name);
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, category)}
            ref={(el) => {
              if (el) {
                tabRefs.current[category.id] = el;
              } else {
                delete tabRefs.current[category.id];
              }
            }}
          >
            {category.icon && typeof category.icon === 'string' && category.icon.startsWith('#') ? (
              <span className="category-icon" style={{ backgroundColor: getCategoryColor(category) }}></span>
            ) : (
              <span className="category-icon-emoji">{category.icon}</span>
            )}
            {(inHeader || !isCollapsed) && (
              <span 
                className="category-name" 
                ref={(el) => {
                  if (el) {
                    labelRefs.current[category.id] = el;
                  } else {
                    delete labelRefs.current[category.id];
                  }
                }}
                title={truncatedTabs.has(category.id) ? category.name : ''}
              >
                {category.name}
              </span>
            )}
            {category.count !== undefined && (
              <span className="category-count-bubble">{category.count}</span>
            )}
          </div>
        ))}
        
        {isAddingCategory ? (
          <div className="category-tab-horizontal add-category-form">
            <div className="color-picker-wrapper">
              <button 
                type="button"
                className="color-button"
                onClick={toggleColorPicker}
                style={{ backgroundColor: selectedColor }}
              >
              </button>
              {showColorPicker && ReactDOM.createPortal(
                <>
                  <div className="color-picker-backdrop" onClick={() => setShowColorPicker(false)}></div>
                  <div className="color-picker-container" ref={colorPickerRef}>
                    <div className="color-grid">
                      {CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => handleColorSelect(color)}
                        />
                      ))}
                    </div>
                  </div>
                </>,
                document.body
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              className="add-category-input"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="New category"
            />
            <div className="add-category-actions">
              <button 
                className="add-category-save" 
                onClick={handleSaveCategory}
                disabled={!newCategoryName.trim()}
              >
                ✓
              </button>
              <button 
                className="add-category-cancel" 
                onClick={handleCancelAddCategory}
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <div
            className="category-tab-horizontal add-category-button"
            data-category-id="add-category"
            onClick={handleStartAddCategory}
          >
            <span className="add-category-icon">+</span>
          </div>
        )}
      </div>
      
      <div className="category-content">
      </div>
      
       {contextMenu && ReactDOM.createPortal(
         <div 
           ref={contextMenuRef}
           className="category-context-menu"
           style={{
             position: 'fixed',
             left: `${contextMenu.x}px`,
             top: `${contextMenu.y}px`,
           }}
         >
           <button
             onClick={async () => {
               try {
                 // Check if deleting the active category
                 const isDeletingActive = contextMenu.category.name === activeCategory;
                 await deleteCategory(contextMenu.category.id);
                 setContextMenu(null);
                 
                 // Switch to "All" if we deleted the active category
                 if (isDeletingActive) {
                   onCategoryChange('All');
                 }
               } catch (error) {
                 console.error('Failed to delete category:', error);
               }
             }}
           >
             <span>Delete Category</span>
           </button>
         </div>,
         document.body
       )}
    </div>
  );
};

export default CategoryTabs;
