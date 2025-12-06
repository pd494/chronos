import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import Sortable from 'sortablejs'
import { useTaskContext } from '../../context/TaskContext/context'

const CATEGORY_COLORS = ['#C5E0F9', '#D3D3FF', '#f67f9cff', '#FFFFC5', '#D4F4DD', '#B8E6E6', '#FFDAB3', '#E8D6C0']
const PROTECTED_CATEGORY_NAMES = new Set(['Today', 'Inbox', 'Completed'])

const CategoryTabs = ({ categories, activeCategory, onCategoryChange, isCollapsed = false, isCompact = false, inHeader = false }) => {
  const { createCategory, reorderCategories, deleteCategory } = useTaskContext()
  const [truncatedTabs, setTruncatedTabs] = useState(new Set())
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [selectedColor, setSelectedColor] = useState('#C5E0F9')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const tabRefs = useRef({})
  const labelRefs = useRef({})
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const tabsContainerRef = useRef(null)
  const colorPickerRef = useRef(null)
  const contextMenuRef = useRef(null)

  useEffect(() => {
    const checkTruncation = () => {
      const newTruncated = new Set()
      Object.entries(labelRefs.current).forEach(([id, element]) => {
        if (element && element.scrollWidth > element.clientWidth) newTruncated.add(id)
      })
      setTruncatedTabs(newTruncated)
    }
    checkTruncation()
    window.addEventListener('resize', checkTruncation)
    return () => window.removeEventListener('resize', checkTruncation)
  }, [categories])

  useEffect(() => {
    if (!listRef.current || isAddingCategory) return
    const sortable = Sortable.create(listRef.current, {
      animation: 200,
      draggable: '[data-draggable="true"]',
      ghostClass: 'opacity-100',
      chosenClass: 'opacity-30',
      dragClass: 'opacity-30',
      direction: 'horizontal',
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex) return
        const orderedIds = Array.from(listRef.current.querySelectorAll('[data-category-id]'))
          .map(el => el.getAttribute('data-category-id'))
          .filter(Boolean)
          .filter(id => id !== 'add-category' && id !== 'all')
        reorderCategories(orderedIds)
      }
    })
    return () => sortable.destroy()
  }, [reorderCategories, categories, isAddingCategory])

  const getCategoryColor = (category) => {
    if (category.icon && category.icon.startsWith('#')) return category.icon
    switch (category.name) {
      case 'All': return '#666'
      case 'Inbox': return '#1761C7'
      case 'Today': return '#FF9500'
      case 'Completed': return '#34C759'
      default: return '#1761C7'
    }
  }

  const handleStartAddCategory = () => { setIsAddingCategory(true); setTimeout(() => inputRef.current?.focus(), 10) }
  const handleSaveCategory = () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    createCategory(trimmed, selectedColor).finally(() => { setNewCategoryName(''); setSelectedColor('#C5E0F9'); setIsAddingCategory(false) })
  }
  const handleCancelAddCategory = () => { setIsAddingCategory(false); setNewCategoryName(''); setSelectedColor('#C5E0F9'); setShowColorPicker(false) }
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSaveCategory(); else if (e.key === 'Escape') handleCancelAddCategory() }
  const toggleColorPicker = (e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker) }
  const handleColorSelect = (color) => { setSelectedColor(color); setShowColorPicker(false) }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) setShowColorPicker(false)
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) setContextMenu(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleContextMenu = (e, category) => {
    e.preventDefault()
    if (category.id === 'all' || PROTECTED_CATEGORY_NAMES.has(category.name)) return
    const rect = e.currentTarget.getBoundingClientRect()
    setContextMenu({ category, x: rect.left + window.pageXOffset, y: rect.bottom + window.pageYOffset + 4 })
  }

  const handleDeleteCategory = async (category) => {
    if (!category?.id) return
    await deleteCategory(category.id)
    if (activeCategory === category.name && category.name !== 'All') onCategoryChange('All')
    setContextMenu(null)
  }

  const headerTabShell = 'flex items-center gap-1 rounded-full font-medium whitespace-nowrap flex-shrink-0 cursor-default transition-colors'
  const headerTabSizing = inHeader ? 'h-[16px] px-[7px] text-[12px]' : 'h-[26px] px-2.5 text-xs'
  const nameTextSize = inHeader ? 'text-[12px]' : 'text-[15px]'
  const iconCircleSize = inHeader ? 'w-[8px] h-[8px] mr-1.5' : 'w-2 h-2 mr-2'
  const iconTextSize = inHeader ? 'mr-1.5 text-[13px]' : 'mr-2 text-sm'
  const countSize = inHeader ? 'text-[11px]' : 'text-xs'

  const containerClass = `flex flex-col w-full overflow-hidden relative ${inHeader ? 'h-full items-center bg-transparent pt-0.5 whitespace-nowrap' : 'bg-[#f5f5f7] border-b border-gray-200'}`
  const tabsRowClass = `flex items-center w-full max-w-full relative ${inHeader ? 'bg-transparent px-3 py-2 h-full gap-1 flex-nowrap justify-start' : 'px-3 py-2.5 pb-2'}`
  const scrollClass = 'flex gap-2 flex-1 min-w-0 overflow-x-auto overflow-y-hidden whitespace-nowrap pr-2 scrollbar-hide'

  return (
    <div className={containerClass} ref={tabsContainerRef}>
      <div className={tabsRowClass}>
        <div className={scrollClass} ref={listRef} style={{ scrollbarWidth: 'none' }}>
          {categories.map(category => {
            const isActive = activeCategory === category.name
            const tabClass = `${headerTabShell} ${headerTabSizing} ${
              isActive ? 'text-gray-900 font-semibold' : 'text-gray-500 hover:bg-black/5'
            } ${inHeader && isActive ? 'bg-gray-100' : ''}`
            return (
              <div key={category.id} data-category-id={category.id} data-draggable={category.id !== 'all' && category.name !== 'future'}
                className={tabClass} onClick={() => category.name && onCategoryChange(category.name)} onContextMenu={(e) => handleContextMenu(e, category)}
                ref={(el) => { if (el) tabRefs.current[category.id] = el; else delete tabRefs.current[category.id] }}>
                {category.icon && typeof category.icon === 'string' && category.icon.startsWith('#') ? (
                  <span className={`rounded-full flex-shrink-0 ${iconCircleSize}`} style={{ backgroundColor: getCategoryColor(category) }} />
                ) : (
                  <span className={`flex-shrink-0 ${iconTextSize}`}>{category.icon}</span>
                )}
                {(inHeader || !isCollapsed) && (
                  <span className={`${nameTextSize} font-normal text-black whitespace-nowrap overflow-hidden text-ellipsis ${isActive ? 'font-semibold' : ''}`}
                    ref={(el) => { if (el) labelRefs.current[category.id] = el; else delete labelRefs.current[category.id] }}
                    title={truncatedTabs.has(category.id) ? category.name : ''}>{category.name}</span>
                )}
                {category.count !== undefined && <span className={`${countSize} text-gray-500 ml-1 ${isActive ? 'text-black' : ''}`}>{category.count}</span>}
              </div>
            )
          })}
        </div>
        {isAddingCategory ? (
          <div className={`flex items-center gap-2 px-2 h-8 min-w-[200px] rounded-md z-[15] animate-[slideIn_0.2s_ease-out] ${inHeader ? 'bg-white' : 'bg-[#f5f5f7]'}`}>
            <div className="relative" ref={colorPickerRef}>
              <button type="button" onClick={toggleColorPicker} className="w-4 h-4 rounded-full border border-black/10 cursor-pointer" style={{ backgroundColor: selectedColor }} />
              {showColorPicker && ReactDOM.createPortal(
                <div className="fixed p-1.5 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col gap-1 z-[9999] modal-fade-in"
                  style={{ top: colorPickerRef.current ? colorPickerRef.current.getBoundingClientRect().bottom + 4 : 0, left: colorPickerRef.current ? colorPickerRef.current.getBoundingClientRect().left - 1 : 0 }}>
                  {CATEGORY_COLORS.map((color) => (
                    <button type="button" key={color} className={`w-4 h-4 rounded-full border cursor-pointer p-0 ${selectedColor === color ? 'border-black' : 'border-black/10'}`}
                      style={{ backgroundColor: color }} onClick={(e) => { e.stopPropagation(); handleColorSelect(color) }} />
                  ))}
                </div>,
                document.body
              )}
            </div>
            <input ref={inputRef} type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="New category" className="flex-1 border-none bg-transparent outline-none text-sm text-black placeholder:text-gray-400" />
            <div className="flex items-center gap-1">
              <button onClick={handleSaveCategory} disabled={!newCategoryName.trim()} className="w-6 h-6 rounded-full flex items-center justify-center text-green-600 hover:bg-green-50 disabled:opacity-40">✓</button>
              <button onClick={handleCancelAddCategory} className="w-6 h-6 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100">×</button>
            </div>
          </div>
        ) : (
          <button onClick={handleStartAddCategory} data-category-id="add-category"
            className={`flex items-center justify-center w-6 h-6 rounded-full text-gray-500 text-lg font-semibold hover:bg-black/5 flex-shrink-0 ${inHeader ? 'bg-transparent' : ''}`}>
            <span style={{ position: 'relative', top: '0.2px' }}>+</span>
          </button>
        )}
      </div>
      {contextMenu && ReactDOM.createPortal(
        <div className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[9999] modal-fade-in" style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }} ref={contextMenuRef}>
          <button onClick={() => handleDeleteCategory(contextMenu.category)} className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
            Delete "{contextMenu.category.name}"
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

export default CategoryTabs
