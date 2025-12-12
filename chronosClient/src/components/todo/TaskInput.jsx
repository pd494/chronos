import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useTaskContext } from '../../context/TaskContext/context'

const CATEGORY_COLORS = ['#C5E0F9', '#D3D3FF', '#f67f9cff', '#FFFFC5', '#D4F4DD', '#B8E6E6', '#FFDAB3', '#E8D6C0']

const TaskInput = ({
  onAddTask, activeCategory, categoryCount, categoryIcon, isEditable = false,
  showNewTaskInput = true, autoFocus = false, showAddButton = true,
  showCategoryHeader = true, placeholder = 'new meeting @ 2pm', onCategoryRenamed = () => {}
}) => {
  const { updateCategory, categories } = useTaskContext()
  const [inputValue, setInputValue] = useState('')
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [categoryNameEdit, setCategoryNameEdit] = useState(activeCategory)
  const [currentIcon, setCurrentIcon] = useState(categoryIcon)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const inputRef = useRef(null)
  const categoryInputRef = useRef(null)
  const colorPickerRef = useRef(null)
  const formRef = useRef(null)

  useEffect(() => { if (autoFocus && inputRef.current) inputRef.current.focus() }, [autoFocus])
  useEffect(() => { setCategoryNameEdit(activeCategory) }, [activeCategory, categoryIcon])

  const activeCategoryColor = useMemo(() => {
    const active = categories.find(cat => cat.name === activeCategory)
    const fromIcon = active?.icon
    if (typeof fromIcon === 'string' && fromIcon.startsWith('#')) return fromIcon
    if (typeof active?.color === 'string' && active.color.startsWith('#')) return active.color
    if (typeof categoryIcon === 'string' && categoryIcon.startsWith('#')) return categoryIcon
    return '#1761C7'
  }, [categories, activeCategory, categoryIcon])

  useEffect(() => { setCurrentIcon(activeCategoryColor) }, [activeCategoryColor])

  const handleSubmit = (e) => { e.preventDefault(); if (inputValue.trim()) { onAddTask(inputValue); setInputValue('') } }
  const toggleColorPicker = (e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker) }

  const handleCategoryEdit = () => {
    setIsEditingCategory(true)
    setCurrentIcon(categoryIcon)
    setTimeout(() => categoryInputRef.current?.focus(), 10)
  }

  const saveCategoryEdit = () => {
    const trimmed = categoryNameEdit.trim()
    if (!trimmed) { setCategoryNameEdit(activeCategory); setIsEditingCategory(false); return }
    const category = categories.find(cat => cat.name === activeCategory)
    if (category) {
      const payload = { name: trimmed }
      if (typeof currentIcon === 'string' && currentIcon.startsWith('#')) payload.color = currentIcon
      if (trimmed !== activeCategory || payload.color) updateCategory(category.id, payload)
      if (trimmed !== activeCategory) onCategoryRenamed(activeCategory, trimmed)
    }
    setCategoryNameEdit(trimmed)
    setIsEditingCategory(false)
  }

  useEffect(() => {
    const handleClickOutside = (event) => { if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) setShowColorPicker(false) }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleOutsideFocus = (event) => {
      if (!showNewTaskInput) return
      if (formRef.current && inputRef.current) {
        const clickedInside = formRef.current.contains(event.target)
        if (!clickedInside && document.activeElement === inputRef.current) {
          inputRef.current.blur()
        }
      }
    }
    document.addEventListener('mousedown', handleOutsideFocus, true)
    return () => document.removeEventListener('mousedown', handleOutsideFocus, true)
  }, [showNewTaskInput])

  return (
    <div className="my-3.5 mb-5">
      {showCategoryHeader && (
        <div className={`flex items-center justify-between px-2 pl-[7px] cursor-default bg-transparent ${activeCategory === 'All' ? 'pb-1' : 'pb-2'}`}>
          <div className="flex items-center gap-4 cursor-default">
            {isEditable ? (
              <div className="relative flex items-center" ref={colorPickerRef}>
                <button type="button" onClick={toggleColorPicker}
                  className="w-4 h-4 rounded-full border border-black/10 cursor-pointer inline-flex items-center justify-center shadow-[0_0_0_1px_rgba(0,0,0,0.04)]"
                  style={{ backgroundColor: (typeof currentIcon === 'string' && currentIcon.startsWith('#')) ? currentIcon : activeCategoryColor }} />
                {showColorPicker && (
                  <div className="absolute top-[26px] left-[-2px] p-1.5 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col gap-1 z-30">
                    {CATEGORY_COLORS.map((color) => (
                      <button type="button" key={color}
                        className={`w-4 h-4 rounded-full border cursor-pointer p-0 ${currentIcon === color ? 'border-black' : 'border-black/10'}`}
                        style={{ backgroundColor: color }}
                        onClick={(e) => { e.stopPropagation(); setCurrentIcon(color); setShowColorPicker(false); const cat = categories.find(c => c.name === activeCategory); if (cat && cat.color !== color) updateCategory(cat.id, { color }) }} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              categoryIcon && <span className="mr-2.5 text-base flex items-center gap-1.5">{categoryIcon}</span>
            )}
            {isEditable && isEditingCategory ? (
              <input ref={categoryInputRef} type="text" value={categoryNameEdit} onChange={(e) => setCategoryNameEdit(e.target.value)}
                className="text-base font-semibold text-black border-none bg-transparent outline-none p-0 m-0 w-auto min-w-[20px] max-w-[200px]"
                onBlur={saveCategoryEdit} onKeyDown={(e) => { if (e.key === 'Enter') saveCategoryEdit(); if (e.key === 'Escape') { setCategoryNameEdit(activeCategory); setIsEditingCategory(false) } }} />
            ) : (
              <span className="text-base font-semibold text-black">{activeCategory}</span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {categoryCount !== undefined && <span className="text-sm text-gray-500 font-medium mr-2">{categoryCount}</span>}
            {isEditable && !isEditingCategory && (
              <button onClick={handleCategoryEdit} className="w-5 h-5 rounded-full bg-transparent border-none text-gray-500 text-lg flex items-center justify-center cursor-pointer p-2 -m-2 hover:bg-black/5 ml-2">✎</button>
            )}
          </div>
        </div>
      )}
      {showNewTaskInput && (
        <form
          ref={formRef}
          className={`flex items-center px-[18px] py-2.5 bg-[#f8f8fa] rounded-xl border border-gray-200 relative shadow-sm overflow-x-hidden ${activeCategory === 'All' ? 'mt-2.5 -mt-[22px] rounded-[13px] px-4 py-3 bg-[#f5f5f7] -ml-2' : 'mt-2.5'}`}
          onSubmit={handleSubmit}
        >
          <input ref={inputRef} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={placeholder}
            className="task-input-field flex-1 border-none bg-transparent py-1.5 pr-3 pl-[9px] text-[15px] outline-none text-black font-normal h-[26px] min-w-0 text-ellipsis whitespace-nowrap overflow-hidden placeholder:text-gray-400" />
          <span className="absolute right-3 text-xs text-black bg-gray-200 px-1.5 py-0.5 rounded font-medium">N</span>
        </form>
      )}
    </div>
  )
}

export default TaskInput
