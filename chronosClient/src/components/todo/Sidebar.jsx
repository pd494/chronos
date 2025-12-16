import React, { useEffect, useRef, useState } from 'react'
import { FiLogOut, FiSettings, FiUser } from 'react-icons/fi'
import TaskInput from './TaskInput'
import TaskList from './TaskList'
import { useTaskContext } from '../../context/TaskContext/context'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'
import { isTaskOlderThanDays } from '../../context/TaskContext/utils'

const Sidebar = ({ activeCategory, isSidebarCollapsed, sidebarWidth, sidebarVisible, toggleSidebar, onCategoryRenamed, onSettingsClick }) => {
  const { tasks, addTask, toggleTaskComplete, categories } = useTaskContext()
  const { user, logout } = useAuth()
  const { settings } = useSettings()

  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    if (!showUserMenu) return undefined
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

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
      if (task.completed) {
        if (settings?.show_completed_tasks !== false && isTaskOlderThanDays(task, 7)) return false
      }
      if (activeCategory === 'All') return true
      if (activeCategory === 'Completed') return task.completed
      return task.category_name === activeCategory
    })

  return (
    <div
      className={`sidebar min-w-[50px] h-screen bg-white border-r border-gray-200 flex flex-col overflow-hidden relative shadow-sm ${isSidebarCollapsed ? 'w-[50px] px-1' : 'pl-4 pr-2'}`}
      style={{ willChange: 'width' }}
      onDragEnter={() => document.body.classList.remove('calendar-drag-focus')}
      onDragOver={() => document.body.classList.remove('calendar-drag-focus')}
    >
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
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

      {/* Bottom Profile Section */}
      {!isSidebarCollapsed && user && (
        <div className="border-t border-gray-200 pt-2 pb-2 px-2">
          <div className="flex items-center justify-end" ref={userMenuRef}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu((p) => !p)}
                className="w-8 h-8 rounded-full overflow-hidden hover:ring-2 hover:ring-gray-200 transition"
                title={user.name || 'Account'}
              >
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name || 'User'}
                    className="w-8 h-8 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gray-200 flex items-center justify-center">
                    <FiUser className="h-4 w-4 text-gray-500" />
                  </div>
                )}
              </button>

              {showUserMenu && (
                <div
                  className="absolute right-0 bottom-[44px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
                  style={{ width: 136 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      onSettingsClick?.()
                    }}
                    className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs text-gray-800 hover:bg-gray-50"
                  >
                    <FiSettings className="h-3.5 w-3.5 text-gray-500" />
                    <span>Settings</span>
                  </button>
                  <div className="h-px bg-gray-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false)
                      logout?.()
                    }}
                    className="w-full flex items-center gap-2 text-left px-2.5 py-1.5 text-xs text-gray-800 hover:bg-gray-50"
                  >
                    <FiLogOut className="h-3.5 w-3.5 text-gray-500" />
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Sidebar
