import React from 'react'
import TaskInput from './TaskInput'
import TaskList from './TaskList'
import { useTaskContext } from '../../context/TaskContext/context'

const Sidebar = ({ activeCategory, isSidebarCollapsed, sidebarWidth, sidebarVisible, toggleSidebar, onCategoryRenamed }) => {
  const { tasks, addTask, toggleTaskComplete, categories } = useTaskContext()

  const handleAddTask = (text) => addTask({ content: text, categoryName: activeCategory })
  const handleToggleComplete = (id) => toggleTaskComplete(id)
  const findActiveCategory = () => categories.find(cat => cat.name === activeCategory)

  const renderCategoryDot = (color, withDate = false) => (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${withDate ? 'mr-1' : ''}`} style={{ backgroundColor: color }} />
  )

  const renderCategoryIcon = () => {
    if (activeCategory === 'All') return '★'
    const category = findActiveCategory()
    if (!category) return null
    if (typeof category.icon === 'string' && category.icon.startsWith('#')) return renderCategoryDot(category.icon)
    return category.icon
  }

  const getTodayDateNumber = () => new Date().getDate().toString()

  const renderTaskInputIcon = () => {
    if (activeCategory === 'Today') {
      const category = findActiveCategory()
      const color = (category && typeof category.icon === 'string' && category.icon.startsWith('#')) ? category.icon : '#FF9500'
      return (
        <>
          {renderCategoryDot(color, true)}
          <span className="text-sm font-medium text-gray-700">{getTodayDateNumber()}</span>
        </>
      )
    }
    return renderCategoryIcon()
  }

  const filteredTasks = tasks
    .filter((task) => {
      if (activeCategory === 'All') return true
      if (activeCategory === 'Completed') return task.completed
      return task.category_name === activeCategory
    })
    .sort(() => 0)

  return (
    <div
      className={`sidebar min-w-[50px] h-screen bg-white border-r border-gray-200 flex flex-col overflow-hidden relative shadow-sm ${isSidebarCollapsed ? 'w-[50px] px-1' : 'pl-4 pr-2'}`}
      style={{ willChange: 'width' }}
      onDragEnter={() => document.body.classList.remove('calendar-drag-focus')}
      onDragOver={() => document.body.classList.remove('calendar-drag-focus')}
    >
      {!isSidebarCollapsed && (
        <>
          {activeCategory !== 'All' ? (
            <TaskInput
              onAddTask={handleAddTask}
              activeCategory={activeCategory}
              categoryIcon={renderTaskInputIcon()}
              categoryCount={filteredTasks.length}
              isEditable={!['All', 'Today', 'Inbox', 'Completed'].includes(activeCategory)}
              showNewTaskInput={true}
              showAddButton={true}
              onCategoryRenamed={onCategoryRenamed}
            />
          ) : (
            <div className="flex items-center justify-between pt-4 pr-[18px] pb-2 pl-[3px] mb-2 relative">
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1.5">{renderCategoryIcon()}</span>
                <span className="text-xl font-semibold text-black">All</span>
              </div>
            </div>
          )}
          {activeCategory === 'All' && (
            <TaskInput onAddTask={handleAddTask} activeCategory={activeCategory} categoryIcon={renderCategoryIcon()} showCategoryHeader={false} showAddButton={false} placeholder="New Todo " />
          )}
          <TaskList tasks={filteredTasks} onToggleComplete={handleToggleComplete} activeCategory={activeCategory} categories={categories} />
        </>
      )}
    </div>
  )
}

export default Sidebar
