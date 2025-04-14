import { useState } from 'react'
import './App.css'
import Calendar from './components/Calendar'

function App() {
  return (
    <div className="app-container">
      <main className="app-content">
        <Calendar />
      </main>
    </div>
  )
}

export default App
