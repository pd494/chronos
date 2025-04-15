import React from 'react';
import Sidebar from './components/sidebar/Sidebar';
import Calendar from './components/Calendar';
import './App.css';
import "allotment/dist/style.css";
import { Allotment } from "allotment";

function App() {
  return (
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
  );
}

export default App;
