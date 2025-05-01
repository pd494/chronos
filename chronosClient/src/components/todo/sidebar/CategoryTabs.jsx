import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './CategoryTabs.css';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

const CategoryTabs = ({ categories, activeCategory, onCategoryChange, onAddCategory, isCollapsed = false }) => {
  const [truncatedTabs, setTruncatedTabs] = useState(new Set());
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('⬤'); // Default emoji (black circle)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const tabRefs = useRef({});
  const inputRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const emojiPickerRef = useRef(null);

  // Check which tabs are truncated
  useEffect(() => {
    const checkTruncation = () => {
      const newTruncated = new Set();
      Object.entries(tabRefs.current).forEach(([id, element]) => {
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

  // Default emoji for new categories
  const defaultEmoji = '⬤'; // Black circle
  
  // Handle starting the add category process
  const handleStartAddCategory = () => {
    setIsAddingCategory(true);
    // Focus the input after it renders
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 10);
  };
  
  // Handle saving the new category
  const handleSaveCategory = () => {
    if (newCategoryName.trim()) {
      const newCategory = {
        id: `category-${Date.now()}`,
        name: newCategoryName.trim(),
        count: 0,
        icon: selectedEmoji
      };
      onAddCategory(newCategory);
      // Reset the form
      setNewCategoryName('');
      setSelectedEmoji('●');
      setIsAddingCategory(false);
    }
  };
  
  // Handle canceling the add category process
  const handleCancelAddCategory = () => {
    setIsAddingCategory(false);
    setNewCategoryName('');
    setSelectedEmoji('●');
    setShowEmojiPicker(false);
  };
  
  // Handle key presses in the input field
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveCategory();
    } else if (e.key === 'Escape') {
      handleCancelAddCategory();
    }
  };

  // Toggle emoji picker
  const toggleEmojiPicker = (e) => {
    e.stopPropagation();
    setShowEmojiPicker(!showEmojiPicker);
  };

  // Handle emoji selection
  const handleEmojiSelect = (emoji) => {
    setSelectedEmoji(emoji.native);
    setShowEmojiPicker(false);
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
    <div className="category-tabs-container" ref={tabsContainerRef}>
      <div className="category-tabs-horizontal">
        {/* Regular category tabs */}
        {categories.filter(cat => cat.id !== 'add-category').map(category => (
          <div
            key={category.id}
            className={`category-tab-horizontal ${activeCategory === category.name ? 'active' : ''}`}
            onClick={() => {
              if (category.name) {
                onCategoryChange(category.name);
              }
            }}
          >
            <span className="category-icon">{category.icon}</span>
            <span 
              className="category-name" 
              ref={el => tabRefs.current[category.id] = el}
              title={truncatedTabs.has(category.id) ? category.name : ''}
            >
              {category.name}
            </span>
            {category.count !== undefined && (
              <span className="category-count-bubble">{category.count}</span>
            )}
          </div>
        ))}
        
        {/* Add category button or form */}
        {isAddingCategory ? (
          <div className="category-tab-horizontal add-category-form">
            <div className="emoji-picker-wrapper">
              <button 
                type="button"
                className="emoji-button"
                onClick={toggleEmojiPicker}
              >
                {selectedEmoji}
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
            <input
              ref={inputRef}
              type="text"
              className="add-category-input"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="New category name..."
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
            onClick={handleStartAddCategory}
          >
            <span className="category-icon add-category-icon">+</span>
          </div>
        )}
      </div>
      
      {/* Rest of the content */}
      <div className="category-content">
        {/* Content will be rendered by other components */}
      </div>
    </div>
  );
};

export default CategoryTabs;
