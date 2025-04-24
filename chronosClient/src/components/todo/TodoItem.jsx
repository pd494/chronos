import { useState } from 'react'
import { FiEdit2, FiTrash2 } from 'react-icons/fi'
import { useTodo } from '../../context/TodoContext'

const TodoItem = ({ todo }) => {
  const { toggleTodo, editTodo, deleteTodo } = useTodo()
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(todo.text)
  
  const handleSubmit = (e) => {
    e.preventDefault()
    if (editText.trim()) {
      editTodo(todo.id, editText)
      setIsEditing(false)
    }
  }
  
  if (isEditing) {
    return (
      <li className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <form onSubmit={handleSubmit} className="flex">
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 mr-2"
            autoFocus
          />
          <button
            type="submit"
            className="px-2 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md ml-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </form>
      </li>
    )
  }
  
  return (
    <li className="todo-item border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center">
      <label className="flex items-center flex-1 cursor-pointer">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => toggleTodo(todo.id)}
          className="todo-checkbox mr-3"
        />
        <span className={`${todo.completed ? 'line-through text-gray-500 dark:text-gray-400' : ''}`}>
          {todo.text}
        </span>
      </label>
      
      <div className="flex space-x-1">
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          aria-label="Edit"
        >
          <FiEdit2 size={16} />
        </button>
        <button
          onClick={() => deleteTodo(todo.id)}
          className="p-1 text-gray-500 hover:text-red-500"
          aria-label="Delete"
        >
          <FiTrash2 size={16} />
        </button>
      </div>
    </li>
  )
}

export default TodoItem