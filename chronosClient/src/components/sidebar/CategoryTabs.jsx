import React, { useState, useRef, useEffect } from 'react';
import './CategoryTabs.css';

const CategoryTabs = ({ categories, activeCategory, onCategoryChange, isCollapsed = false }) => {
  const [truncatedTabs, setTruncatedTabs] = useState(new Set());
  const tabRefs = useRef({});

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

  const defaultCategories = [
    { id: 'star', name: 'All', count: 398, icon: '★' },
    { id: 'inbox', name: 'Inbox', count: 5, icon: '📥' },
    { id: 'today', name: 'Today', count: 1, icon: '1' },
    { id: 'all-email', name: 'all email', count: 351, icon: '●' },
    { id: 'email', name: 'Email', count: 42, icon: '●' },
    { id: 'completed', name: 'Completed', count: 104, icon: '✓' },
    { id: 'add', name: '', count: null, icon: '+' }
  ];

  return (
    <div className="category-tabs-container">
      <div className="category-tabs-horizontal">
        {defaultCategories.map(category => (
          <div
            key={category.id}
            className={`category-tab-horizontal ${activeCategory === category.name ? 'active' : ''}`}
            onClick={() => category.id !== 'menu' && category.id !== 'add' ? onCategoryChange(category.name) : null}
          >
            {category.id === 'star' || category.id === 'inbox' || category.id === 'today' || category.id === 'all-email' || category.id === 'email' || category.id === 'completed' ? (
              <>
                {category.id === 'all-email' || category.id === 'email' ? (
                  <span className="category-icon"><span className="dot email-dot" /></span>
                ) : (
                  <span className="category-icon">{category.icon}</span>
                )}
                <span 
                  className="category-name" 
                  ref={el => tabRefs.current[category.id] = el}
                  title={truncatedTabs.has(category.id) ? category.name : ''}
                >
                  {category.name}
                </span>
                <span className="category-count-bubble">{category.count}</span>
              </>
            ) : (
              <span className="category-icon">{category.icon}</span>
            )}
          </div>
        ))}
      </div>
      
      {/* Rest of the content */}
      <div className="category-content">
        {/* Content will be rendered by other components */}
      </div>
    </div>
  );
};

export default CategoryTabs;
