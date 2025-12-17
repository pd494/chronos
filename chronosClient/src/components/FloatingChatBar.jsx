import { useState, useRef, useEffect } from 'react';
import { FiClock, FiSend, FiPlus, FiX, FiArrowRight } from 'react-icons/fi';
import { useCalendar } from '../context/CalendarContext';
import { chatApi } from '../lib/api';
import {useTaskContext} from '../context/TaskContext/context';

const FloatingChatBar = () => {
  const ROW_ANIM_DURATION = 240;
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [displayedQuery, setDisplayedQuery] = useState('');
  const [removingItems, setRemovingItems] = useState(new Set());
  const [containerRemoving, setContainerRemoving] = useState(false);
  const { openEventModal } = useCalendar();
  const inputRef = useRef(null);
  const {addTask} = useTaskContext();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (query.trim()) {
      setLoading(true);
      setDisplayedQuery(query);
      try {
        const response = await chatApi.getTodoSuggestions(query);
        let formatted;
        try {
          let parsed = JSON.parse(response);
          if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          formatted = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          formatted = [];
        }

        const cleanedResult = (formatted || []).filter(
          (item) => item && typeof item === 'object' && typeof item.content === 'string'
        );

        setResult(cleanedResult);
        setQuery('');
      } catch (error) {
        console.error('Error:', error);
        setResult([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleClear = () => {
    setResult(null);
    setDisplayedQuery('');
    setQuery('');
    setRemovingItems(new Set());
    setContainerRemoving(false);
  };

  const handleAddTodo = (item, index) => {
    const categoryName = item.category_name || 'Inbox';

    // Start fade-out animation for this row
    setRemovingItems(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    // After the row animation completes, create the task and then remove it from suggestions
    setTimeout(async () => {
      try {
        await addTask({
          content: item.content || item,
          categoryName
        });
      } catch (error) {
        console.error('Failed to add todo:', error);
      }

      setResult(prev => {
        if (!prev) return prev;
        const next = prev.filter((_, i) => i !== index);

        // If all todos have been added, fade out the whole chat card and reset
        if (next.length === 0) {
          setContainerRemoving(true);
          setTimeout(() => {
            handleClear();
          }, ROW_ANIM_DURATION);
        }

        return next;
      });

      setRemovingItems(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }, ROW_ANIM_DURATION);
  };

  const handleTimerClick = () => {};

  const handleNewEvent = () => {
    const now = new Date();
    const later = new Date(now);
    later.setHours(now.getHours() + 1);

    const newEvent = {
      id: `temp-${Date.now()}`,
      title: '',
      start: now,
      end: later,
      color: 'blue',
    };

    openEventModal(newEvent, true);
  };
  
  const showResults = result || loading;

  return (
    <>
      <style>
        {`
          @keyframes border-spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
          @keyframes fade-out-right {
            from {
              opacity: 1;
              transform: translateX(0);
            }
            to {
              opacity: 0;
              transform: translateX(-100%);
            }
          }
          @keyframes fade-out-card {
            from {
              opacity: 1;
              transform: translateY(0);
            }
            to {
              opacity: 0;
              transform: translateY(8px);
            }
          }
        `}
      </style>
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-4 flex flex-col gap-4">
        
        {/* Unified Result Container with Rotating Border */}
        {showResults && (
          <div
            className={`relative rounded-[24px] overflow-hidden p-[2px] shadow-lg ${
              containerRemoving ? 'animate-[fade-out-card_0.24s_ease-out_forwards]' : ''
            }`}
          >
            {/* Spinning Gradient Border (Snake Effect) */}
            <div 
              className="absolute inset-[-250%] bg-[conic-gradient(from_0deg,#B8B8FF_0deg,#B8B8FF_272deg,#7C7CFF_270deg,#7C7CFF_360deg)]"
              style={{ animation: 'border-spin 3s linear infinite' }}
            />
            
            {/* Content Container (Masking the center) */}
            <div className={`relative flex flex-col bg-white dark:bg-gray-800 rounded-[21px] h-full ${loading ? 'opacity-95' : ''}`}>
               {/* Header / Query Display */}
               <div className="flex items-center justify-between p-4 pb-2">
                 <div className="flex-1 px-1 text-gray-700 dark:text-gray-200 font-medium text-[15px]">
                   {displayedQuery}
                 </div>
                 {!loading && (
                   <button
                      onClick={handleClear}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors bg-gray-50 dark:bg-gray-700 rounded-full"
                    >
                      <FiX size={16} />
                    </button>
                 )}
               </div>

               {/* Results List */}
               {result && !loading && (
                <div className="flex flex-col gap-1 p-2 max-h-[60vh] overflow-y-auto">
                  {result.map((item, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center justify-between p-3 rounded-[16px] hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group ${
                        removingItems.has(index) ? 'animate-[fade-out-right_0.24s_ease-out_forwards]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 overflow-hidden">
                        <div className="w-[18px] h-[18px] border-2 border-gray-400 rounded-md flex-shrink-0 group-hover:border-gray-500 transition-colors"></div>
                        <span className="text-gray-700 dark:text-gray-200 text-[14px] truncate">{item.content || item}</span>
                      </div>
                      <button 
                        onClick={() => handleAddTodo(item, index)}
                        className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-[12px] font-medium px-3 py-1.5 rounded-full text-gray-600 dark:text-gray-300 transition-colors whitespace-nowrap ml-2"
                      >
                        Add to {item.category_name || 'Inbox'}
                        <FiArrowRight size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Loading Placeholder */}
              {loading && (
                 <div className="p-8 flex justify-center items-center text-gray-400 text-sm italic">
                   Thinking...
                 </div>
              )}
            </div>
          </div>
        )}

        {/* Input Form (Initial State) */}
        {!showResults && (
          <form 
            onSubmit={handleSubmit}
            className="flex items-center bg-white dark:bg-gray-800 rounded-full shadow-lg p-2 pl-4 border-2 transition-all duration-300"
            style={{ borderColor: '#B8B8FF' }} 
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask Chronos..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 py-2 bg-transparent outline-none text-gray-700 dark:text-gray-200 text-[15px]"
            />
            
            <div className="flex items-center space-x-1 ml-2">
              
              
          
          
              <button
                type="submit"
                className={`p-2.5 rounded-full transition-all duration-200 ${
                  query.trim() 
                    ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-md' 
                    : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                }`}
                disabled={!query.trim()}
              >
                <FiSend size={18} className={query.trim() ? 'ml-0.5' : ''} />
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
};

export default FloatingChatBar;