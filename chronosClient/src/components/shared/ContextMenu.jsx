import React, { useRef, useEffect, useState } from 'react';
import { Picker } from '@emoji-mart/react';
import data from '@emoji-mart/data';
import './ContextMenu.css';

const ContextMenu = ({ x, y, onClose, onSelectColor, onSelectEmoji, selectedColor }) => {
  const menuRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // Define available colors
  const colors = [
    { id: 'blue', value: '#4285f4' },
    { id: 'teal', value: '#00a9a7' },
    { id: 'green', value: '#34a853' },
    { id: 'purple', value: '#a142f4' },
    { id: 'orange', value: '#fa7b17' },
    { id: 'red', value: '#ea4335' },
    { id: 'black', value: '#202124' },
    { id: 'pink', value: '#e91e63' },
    { id: 'brown', value: '#795548' },
    { id: 'lavender', value: '#9c27b0' },
    { id: 'cyan', value: '#00bcd4' },
    { id: 'yellow', value: '#ffeb3b' },
    { id: 'lime', value: '#cddc39' }
  ];

  useEffect(() => {
    // Close menu when clicking outside
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleColorSelect = (colorId) => {
    onSelectColor(colorId);
  };

  const handleEmojiSelect = (emojiData) => {
    onSelectEmoji(emojiData.native);
    setShowEmojiPicker(false);
  };

  const toggleEmojiPicker = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };

  return (
    <div 
      className="context-menu" 
      style={{ top: y, left: x }}
      ref={menuRef}
    >
      <div className="menu-section">
        <div className="menu-section-title">Change Color</div>
        <div className="color-options">
          {colors.map(color => (
            <div 
              key={color.id}
              className={`color-option ${selectedColor === color.id ? 'selected' : ''}`}
              style={{ backgroundColor: color.value }}
              onClick={() => handleColorSelect(color.id)}
            />
          ))}
        </div>
      </div>
      
      <div className="menu-section">
        <div className="menu-section-title">Add Emoji</div>
        <button className="emoji-button" onClick={toggleEmojiPicker}>
          Choose Emoji 😊
        </button>
        {showEmojiPicker && (
          <div className="emoji-picker-container">
            <Picker 
              data={data} 
              onEmojiSelect={handleEmojiSelect} 
              theme="light"
              previewPosition="none"
              skinTonePosition="none"
              maxFrequentRows={1}
              perLine={7}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ContextMenu;
