import React, { useState, useRef, useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { arrayMove } from '@dnd-kit/sortable'
import { useTaskContext } from '../../context/TaskContext/context'

const CATEGORY_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#FBBF24', '#10B981', '#14B8A6', '#F97316', '#EF4444']
const PROTECTED_CATEGORY_NAMES = new Set(['Today', 'Inbox', 'Completed'])

// Sortable category tab component
const SortableCategoryTab = ({
  category,
  isActive,
  onCategoryChange,
  onContextMenu,
  isCollapsed,
  inHeader,
  truncatedTabs,
  tabRefs,
  labelRefs,
  getCategoryColor,
  headerTabShell,
  headerTabSizing,
  nameTextSize,
  iconCircleSize,
  iconTextSize,
  countSize,
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const isDraggable = category.id !== 'all' && category.name !== 'future'

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: category.id,
    disabled: !isDraggable,
    data: {
      type: 'category-tab',
      id: category.id,
      category,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined,
  }

  const tabClass = `${headerTabShell} ${headerTabSizing} ${inHeader ? ((isActive || isHovered) ? 'py-[6px]' : 'py-[2px]') : ''} ${isActive ? 'text-gray-900 font-semibold' : 'text-gray-500'
    } ${inHeader && (isActive || isHovered) ? 'bg-gray-100' : (!isActive ? 'hover:bg-black/5' : '')}`

  return (
    <div
      ref={(el) => {
        setNodeRef(el)
        if (el) tabRefs.current[category.id] = el
        else delete tabRefs.current[category.id]
      }}
      style={style}
      data-category-id={category.id}
      data-draggable={isDraggable}
      className={tabClass}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => category.name && onCategoryChange(category.name)}
      onContextMenu={(e) => onContextMenu(e, category)}
      {...(isDraggable ? { ...attributes, ...listeners } : {})}
    >
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
      {category.count !== undefined && (
        <span className={`${countSize} text-gray-400 ml-1`}>{category.count}</span>
      )}
    </div>
  )
}

const CategoryTabs = ({ categories, activeCategory, onCategoryChange, isCollapsed = false, isCompact = false, inHeader = false }) => {
  const { createCategory, reorderCategories, deleteCategory } = useTaskContext()
  const [truncatedTabs, setTruncatedTabs] = useState(new Set())
  const [hiddenCount, setHiddenCount] = useState(0)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [selectedColor, setSelectedColor] = useState('#3B82F6')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const tabRefs = useRef({})
  const labelRefs = useRef({})
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const tabsContainerRef = useRef(null)
  const colorPickerRef = useRef(null)
  const contextMenuRef = useRef(null)

  // Get category IDs for SortableContext
  const categoryIds = useMemo(() =>
    categories
      .filter(cat => cat.id !== 'add-category')
      .map(cat => cat.id),
    [categories]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!active?.id || !over?.id) return
    if (String(active.id) === String(over.id)) return

    const activeCat = categories.find(c => String(c.id) === String(active.id))
    const overCat = categories.find(c => String(c.id) === String(over.id))
    if (!activeCat || !overCat) return

    // Keep "All" pinned, but allow reordering any other category.
    if (activeCat.id === 'all' || overCat.id === 'all') return

    // Reorder based on the current rendered order (excluding "All").
    const reorderableIds = categoryIds.filter(id => id !== 'all')
    const oldIndex = reorderableIds.findIndex(id => String(id) === String(active.id))
    const newIndex = reorderableIds.findIndex(id => String(id) === String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    const nextIds = arrayMove(reorderableIds, oldIndex, newIndex)
    await reorderCategories(nextIds)
  }

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
    if (!inHeader) return

    let raf = 0
    let ro = null
    const updateHidden = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const container = listRef.current
        if (!container) return

        const containerRect = container.getBoundingClientRect()
        let fullyVisible = 0

        for (const cat of categories) {
          const el = tabRefs.current?.[cat.id]
          if (!el) continue
          const r = el.getBoundingClientRect()
          // Count only if the entire chip is inside the viewport of the scroll container
          if (r.left >= containerRect.left && r.right <= containerRect.right) fullyVisible += 1
        }

        setHiddenCount(Math.max(0, categories.length - fullyVisible))
      })
    }

    updateHidden()
    const onScroll = () => updateHidden()

    const el = listRef.current
    el?.addEventListener('scroll', onScroll, { passive: true })

    // Sidebar resizing may not trigger window resize; observe container width changes.
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateHidden())
      ro.observe(el)
    } else {
      // Fallback
      window.addEventListener('resize', updateHidden)
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      el?.removeEventListener('scroll', onScroll)
      if (ro) ro.disconnect()
      window.removeEventListener('resize', updateHidden)
    }
  }, [inHeader, categories])

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
    createCategory(trimmed, selectedColor).finally(() => { setNewCategoryName(''); setSelectedColor('#3B82F6'); setIsAddingCategory(false) })
  }
  const handleCancelAddCategory = () => { setIsAddingCategory(false); setNewCategoryName(''); setSelectedColor('#3B82F6'); setShowColorPicker(false) }
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

  const headerTabShell = 'flex items-center gap-1 rounded-[7px] font-medium whitespace-nowrap flex-shrink-0 cursor-default transition-colors'
  const headerTabSizing = inHeader ? 'px-[8px] text-[12px] leading-[14px]' : 'h-[26px] px-2.5 text-xs'
  const nameTextSize = inHeader ? 'text-[12px]' : 'text-[15px]'
  const iconCircleSize = inHeader ? 'w-[8px] h-[8px] mr-1.5' : 'w-2 h-2 mr-2'
  const iconTextSize = inHeader ? 'mr-1.5 text-[13px]' : 'mr-2 text-sm'
  const countSize = inHeader ? 'text-[11px]' : 'text-xs'

  const containerClass = `flex flex-col w-full overflow-visible relative ${inHeader ? 'h-full items-center bg-transparent pt-0.5 whitespace-nowrap' : 'bg-[#f5f5f7] border-b border-gray-200'}`
  const tabsRowClass = `flex items-center w-full max-w-full relative ${inHeader ? `bg-transparent ${isAddingCategory ? 'pl-2 pr-1' : 'px-3'} py-2 h-full gap-1 flex-nowrap justify-start overflow-visible` : 'px-3 py-2.5 pb-2'}`
  const scrollClass = 'flex gap-2 flex-1 min-w-0 overflow-x-auto overflow-y-hidden whitespace-nowrap pr-2 scrollbar-hide relative'

  return (
    <div className={containerClass} ref={tabsContainerRef}>
      <div className={tabsRowClass}>
        <div
          className={`${scrollClass} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isAddingCategory ? 'hidden' : ''}`}
          ref={listRef}
        >
          {inHeader && !isAddingCategory && (
            <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-white to-transparent dark:from-gray-800" />
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={categoryIds} strategy={horizontalListSortingStrategy}>
              {categories.map(category => (
                <SortableCategoryTab
                  key={category.id}
                  category={category}
                  isActive={activeCategory === category.name}
                  onCategoryChange={onCategoryChange}
                  onContextMenu={handleContextMenu}
                  isCollapsed={isCollapsed}
                  inHeader={inHeader}
                  truncatedTabs={truncatedTabs}
                  tabRefs={tabRefs}
                  labelRefs={labelRefs}
                  getCategoryColor={getCategoryColor}
                  headerTabShell={headerTabShell}
                  headerTabSizing={headerTabSizing}
                  nameTextSize={nameTextSize}
                  iconCircleSize={iconCircleSize}
                  iconTextSize={iconTextSize}
                  countSize={countSize}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        {inHeader && hiddenCount > 0 && !isAddingCategory && (
          <div className="flex items-center text-[12px] text-gray-500 whitespace-nowrap mr-2">
            {hiddenCount} more
          </div>
        )}
        {isAddingCategory ? (
          <div className={`flex items-center gap-2 px-2 h-8 flex-1 min-w-0 w-full max-w-full rounded-md z-[15] animate-[slideIn_0.2s_ease-out] border border-[#e5e5ea] ${inHeader ? 'bg-white' : 'bg-[#f5f5f7]'}`}>
            <div className={`relative flex items-center ${inHeader ? 'ml-[7px]' : ''}`} ref={colorPickerRef}>
              <button
                type="button"
                onClick={toggleColorPicker}
                className={`rounded-full flex-shrink-0 border border-black/10 cursor-pointer p-0 block ${inHeader ? 'w-[10px] h-[10px] mr-1.5' : iconCircleSize}`}
                style={{ backgroundColor: selectedColor, borderRadius: '50%', aspectRatio: '1 / 1', lineHeight: 0 }}
                aria-label="Pick category color"
              />
              {showColorPicker && ReactDOM.createPortal(
                <div
                  className="fixed p-1.5 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col gap-1 z-[9999] modal-fade-in"
                  style={{
                    top: colorPickerRef.current ? colorPickerRef.current.getBoundingClientRect().bottom + 4 : 0,
                    left: colorPickerRef.current ? (() => {
                      const rect = colorPickerRef.current.getBoundingClientRect()
                      const circleCenterX = rect.left + (rect.width / 2)
                      const dropdownWidth = 30 // Approximate width: 16px button + 12px padding + 2px border
                      return circleCenterX - (dropdownWidth / 2)
                    })() : 0,
                  }}
                >
                  {CATEGORY_COLORS.map((color) => (
                    <button type="button" key={color} className={`w-4 h-4 rounded-full border cursor-pointer p-0 ${selectedColor === color ? 'border-black' : 'border-black/10'}`}
                      style={{ backgroundColor: color }} onClick={(e) => { e.stopPropagation(); handleColorSelect(color) }} />
                  ))}
                </div>,
                document.body
              )}
            </div>
            <input ref={inputRef} type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="New category" className="flex-1 min-w-0 border-none bg-transparent outline-none text-sm text-black placeholder:text-gray-400" />
            <div className="flex items-center gap-1">
              <button
                onClick={handleSaveCategory}
                disabled={!newCategoryName.trim()}
                className="w-6 h-6 rounded-full flex items-center justify-center bg-white text-green-700 border border-green-200 hover:bg-green-50 disabled:opacity-40 disabled:hover:bg-white text-base leading-none font-semibold"
                aria-label="Create category"
                type="button"
              >
                ✓
              </button>
            </div>
          </div>
        ) : (
          <button onClick={handleStartAddCategory} data-category-id="add-category"
            className={`flex items-center justify-center w-6 h-6 rounded-full text-gray-500 text-lg font-semibold hover:bg-black/5 flex-shrink-0 ${inHeader ? 'bg-transparent' : ''}`}>
            <span style={{ position: 'relative', top: '-1.8px' }}>+</span>
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
