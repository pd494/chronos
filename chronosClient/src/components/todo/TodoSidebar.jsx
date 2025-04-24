import { useState } from 'react'
import { FiCheckSquare, FiPlus } from 'react-icons/fi'
import { useTodo } from '../../context/TodoContext'
import TodoItem from './TodoItem'
import TodoForm from './TodoForm'

const TodoSidebar = () => {
  const { getFilteredTodos, changeFilter, filter, clearCompleted } = useTodo()
  const [showAddForm, setShowAddForm] = useState(false)
  
  const todos = getFilteredTodos()
  
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center text-lg font-semibold">
          <FiCheckSquare className="mr-2" />
          <h2>My Tasks</h2>
        </div>
        
        <button
          onClick={() => setShowAddForm(true)}
          className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Add task"
        >
          <FiPlus />
        </button>
      </div>
      
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          className={`flex-1 py-2 text-sm font-medium ${
            filter === 'all'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
          onClick={() => changeFilter('all')}
        >
          All
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium ${
            filter === 'active'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
          onClick={() => changeFilter('active')}
        >
          Active
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium ${
            filter === 'completed'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
          onClick={() => changeFilter('completed')}
        >
          Completed
        </button>
      </div>
      
      {showAddForm && (
        <TodoForm onClose={() => setShowAddForm(false)} />
      )}
      
      <div className="flex-1 overflow-y-auto">
        {todos.length > 0 ? (
          <ul>
            {todos.map(todo => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 text-center">
            <p>No tasks found</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Add a task
            </button>
          </div>
        )}
      </div>
      
      {filter === 'completed' && todos.length > 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={clearCompleted}
            className="w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Clear completed
          </button>
        </div>
      )}
    </div>
  )
}

export default TodoSidebar