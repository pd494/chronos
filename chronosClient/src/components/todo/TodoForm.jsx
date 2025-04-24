import { useState } from 'react'
import { useTodo } from '../../context/TodoContext'

const TodoForm = ({ onClose }) => {
  const { addTodo } = useTodo()
  const [text, setText] = useState('')
  
  const handleSubmit = (e) => {
    e.preventDefault()
    if (text.trim()) {
      addTodo(text)
      setText('')
      onClose()
    }
  }
  
  return (
    <form onSubmit={handleSubmit} className="p-4 border-b border-gray-200 dark:border-gray-700">
      <input
        type="text"
        placeholder="Add a new task..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 mb-2"
        autoFocus
      />
      
      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
          disabled={!text.trim()}
        >
          Add Task
        </button>
      </div>
    </form>
  )
}

export default TodoForm