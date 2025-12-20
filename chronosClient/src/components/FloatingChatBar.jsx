import { useState, useRef } from 'react';
import { FiSend, FiX, FiCalendar, FiCheckSquare, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { useCalendar } from '../context/CalendarContext';
import { chatApi } from '../lib/api';
import { useTaskContext } from '../context/TaskContext/context';
import EventModal from './events/EventModal/EventModal';

const FloatingChatBar = () => {
  const ROW_ANIM_DURATION = 240;
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [calendarMatchedEvents, setCalendarMatchedEvents] = useState([]);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [eventTransition, setEventTransition] = useState('');
  const [loading, setLoading] = useState(false);
  const [displayedQuery, setDisplayedQuery] = useState('');
  const [removingItems, setRemovingItems] = useState(new Set());
  const [containerRemoving, setContainerRemoving] = useState(false);
  const [mode, setMode] = useState('todo'); // 'todo' or 'calendar'

  const { refreshEvents } = useCalendar();
  const { addTask } = useTaskContext();
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setDisplayedQuery(query);
    setResult(null);
    setCalendarMessage('');
    setCalendarMatchedEvents([]);

    try {
      if (mode === 'todo') {
        const response = await chatApi.getTodoSuggestions(query);
        let parsed = typeof response === 'string' ? JSON.parse(response) : response;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        const formatted = Array.isArray(parsed) ? parsed : [parsed];
        const cleaned = formatted.filter(item => item?.content);
        setResult(cleaned);
        setCalendarMessage('');
      } else {
        const response = await chatApi.calendarChat(query, { signal: abortControllerRef.current.signal });
        setCalendarMessage(response.message || 'Action completed.');
        setCalendarMatchedEvents(Array.isArray(response?.matched_events) ? response.matched_events : []);
        setCurrentEventIndex(0);
        if (response?.did_mutate) refreshEvents();
      }
      setQuery('');
    } catch (error) {
      if (error?.name === 'AbortError') {
        setCalendarMessage('Cancelled.');
        setResult(null);
        setCalendarMatchedEvents([]);
      } else {
        console.error('Error:', error);
        setResult([]);
        setCalendarMessage('Sorry, something went wrong.');
        setCalendarMatchedEvents([]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoading(false);
  };

  const handleClear = () => {
    setResult(null);
    setCalendarMessage('');
    setCalendarMatchedEvents([]);
    setDisplayedQuery('');
    setQuery('');
    setRemovingItems(new Set());
    setContainerRemoving(false);
  };

  const handleAddTodo = (item, index) => {
    setRemovingItems(prev => new Set(prev).add(index));

    setTimeout(async () => {
      try {
        await addTask({
          content: item.content,
          categoryName: item.category_name || 'Inbox'
        });
      } catch (err) {
        console.error('Failed to add todo:', err);
      }

      setResult(prev => {
        if (!prev) return prev;
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          setContainerRemoving(true);
          setTimeout(handleClear, ROW_ANIM_DURATION);
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

  const showResults = result || calendarMessage || loading || (calendarMatchedEvents && calendarMatchedEvents.length > 0);

  return (
    <>
      <style>
        {`
          @keyframes border-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes fade-out-right { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-100%); } }
          @keyframes fade-out-card { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(8px); } }
        `}
      </style>
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-4 flex flex-col gap-4">
        {showResults && (
          <div className={`relative rounded-[24px] overflow-hidden p-[2px] shadow-lg ${containerRemoving ? 'animate-[fade-out-card_0.24s_ease-out_forwards]' : ''}`}>
            <div
              className="absolute inset-[-250%] bg-[conic-gradient(from_0deg,#B8B8FF_0deg,#B8B8FF_272deg,#7C7CFF_270deg,#7C7CFF_360deg)]"
              style={{ animation: 'border-spin 3s linear infinite' }}
            />

            <div className={`relative flex flex-col bg-white dark:bg-gray-800 rounded-[21px] h-full ${loading ? 'opacity-95' : ''}`}>
              <div className="flex items-center justify-between p-4 pb-2">
                <div className="flex-1 px-1 text-gray-700 dark:text-gray-200 font-normal text-[15px]">
                  {displayedQuery}
                </div>
                {loading ? (
                  <button onClick={handleCancel} className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors bg-gray-50 dark:bg-gray-700 rounded-full">
                    <FiX size={16} />
                  </button>
                ) : (
                  <button onClick={handleClear} className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors bg-gray-50 dark:bg-gray-700 rounded-full">
                    <FiX size={16} />
                  </button>
                )}
              </div>

              {/* Grey divider line after query */}
              <div className="mx-4 border-t border-gray-200/70 dark:border-gray-700/70" />

              {calendarMessage && !loading && (
                <div className="relative">
                  <div className="px-4 pt-1 pb-2 text-gray-600 dark:text-gray-300 text-[14px] leading-relaxed max-h-[160px] overflow-y-auto scrollbar-hide">
                    {calendarMessage.split('\n').map((line, lineIndex) => (
                      <div key={lineIndex} className={lineIndex > 0 ? 'mt-1' : ''}>
                        {line.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                          part.startsWith('**') && part.endsWith('**')
                            ? <strong key={i} className="font-semibold text-gray-800 dark:text-white">{part.slice(2, -2)}</strong>
                            : part
                        )}
                      </div>
                    ))}
                    <div className="h-4" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-[#1a1a1b] to-transparent pointer-events-none z-10" />
                </div>
              )}

              {mode === 'calendar' && !loading && Array.isArray(calendarMatchedEvents) && calendarMatchedEvents.length > 0 && (
                <>
                  <div className="mx-4 border-t border-gray-200/70 dark:border-gray-700/70" />
                  <div className="p-2 relative">
                    {/* Left arrow - show if there are previous events */}
                    {calendarMatchedEvents.length > 1 && (
                      <button
                        onClick={() => {
                          setEventTransition('slide-out-right');
                          setTimeout(() => {
                            setCurrentEventIndex(prev => prev === 0 ? calendarMatchedEvents.length - 1 : prev - 1);
                            setEventTransition('slide-in-left');
                            setTimeout(() => setEventTransition(''), 300);
                          }, 150);
                        }}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-white/80 dark:bg-gray-800/80 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <FiChevronLeft size={18} className="text-gray-500" />
                      </button>
                    )}

                    {/* Event modal with animation */}
                    <div
                      className={`transition-all duration-[300ms] ease-out ${
                        eventTransition === 'slide-out-right' ? 'opacity-0 translate-x-4' :
                        eventTransition === 'slide-out-left' ? 'opacity-0 -translate-x-4' :
                        'opacity-100 translate-x-0'
                      }`}
                    >
                      <EventModal event={calendarMatchedEvents[currentEventIndex]} renderInline={true} readOnly={true} />
                    </div>

                    {/* Right arrow - show if there are more events */}
                    {calendarMatchedEvents.length > 1 && (
                      <button
                        onClick={() => {
                          setEventTransition('slide-out-left');
                          setTimeout(() => {
                            setCurrentEventIndex(prev => prev === calendarMatchedEvents.length - 1 ? 0 : prev + 1);
                            setEventTransition('slide-in-right');
                            setTimeout(() => setEventTransition(''), 300);
                          }, 150);
                        }}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-white/80 dark:bg-gray-800/80 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <FiChevronRight size={18} className="text-gray-500" />
                      </button>
                    )}

                    {/* Event indicator dots */}
                    {calendarMatchedEvents.length > 1 && (
                      <div className="flex justify-center gap-1.5 mt-2">
                        {calendarMatchedEvents.map((_, idx) => (
                          <div
                            key={idx}
                            className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${idx === currentEventIndex ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {result && !loading && (
                <div className="flex flex-col gap-1 p-2 max-h-[60vh] overflow-y-auto">
                  {result.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded-[16px] hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group ${removingItems.has(index) ? 'animate-[fade-out-right_0.24s_ease-out_forwards]' : ''}`}
                    >
                      <div className="flex items-center gap-3 flex-1 overflow-hidden">
                        <div className="w-[18px] h-[18px] border-2 border-gray-400 rounded-md flex-shrink-0 group-hover:border-gray-500 transition-colors"></div>
                        <span className="text-gray-700 dark:text-gray-200 text-[14px] truncate">{item.content}</span>
                      </div>
                      <button
                        onClick={() => handleAddTodo(item, index)}
                        className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-[12px] font-medium px-3 py-1.5 rounded-full text-gray-600 dark:text-gray-300 transition-colors whitespace-nowrap ml-2"
                      >
                        Add to {item.category_name || 'Inbox'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {loading && (
                <div className="p-8 flex justify-center items-center text-gray-400 text-sm italic">
                  Thinking...
                </div>
              )}
            </div>
          </div>
        )}

        {!showResults && (
          <div className="flex flex-col gap-2">
            <form
              onSubmit={handleSubmit}
              className="flex items-center bg-white dark:bg-gray-800 rounded-full shadow-lg p-2 pl-4 border-2 transition-all duration-300"
              style={{ borderColor: mode === 'todo' ? '#B8B8FF' : '#7C7CFF' }}
            >
              <input
                ref={inputRef}
                type="text"
                placeholder={mode === 'todo' ? "Quick add todos..." : "Ask your calendar..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 py-2 bg-transparent outline-none text-gray-700 dark:text-gray-200 text-[15px]"
              />

              <div className="flex items-center space-x-1 ml-2">
                <button
                  type="button"
                  onClick={() => setMode(mode === 'todo' ? 'calendar' : 'todo')}
                  className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                  title={mode === 'todo' ? "Switch to Calendar Chat" : "Switch to Todo Suggestions"}
                >
                  {mode === 'todo' ? <FiCalendar size={20} /> : <FiCheckSquare size={20} />}
                </button>
                <button
                  type="submit"
                  className={`p-2.5 rounded-full transition-all duration-200 ${query.trim() ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-md' : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'}`}
                  disabled={!query.trim()}
                >
                  <FiSend size={18} />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
};

export default FloatingChatBar;
