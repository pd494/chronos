import React from 'react';
import Sidebar from './components/sidebar/Sidebar';
import Calendar from './components/Calendar';
import './App.css';
import "allotment/dist/style.css";
import { Allotment } from "allotment";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TaskProvider } from './context/TaskContext';

function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <TaskProvider>
        <div className="app-container">
          <Allotment defaultSizes={[272, 700]}> {/* Initial width for Sidebar, rest for Calendar */}
            <Allotment.Pane minSize={0} maxSize={1000}> {/* Allow sidebar resizing with increased maximum width */} 
              <Sidebar />
            </Allotment.Pane>
            <Allotment.Pane minSize={0}>
              <Calendar />
            </Allotment.Pane>
          </Allotment>
        </div>
      </TaskProvider>
    </DndProvider>
  );
}

export default App;
