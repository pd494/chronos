import ParticipantChips from './ParticipantChips'
import LocationSection from './LocationSection'
import { getColorHex } from './constants'

const EventModalPreview = ({ event }) => {
  if (!event) return null

  const bg = getColorHex(event.color || event.provider_color || event.calendar_color)
  const participants = Array.isArray(event.participants)
    ? event.participants
    : Array.isArray(event.attendees)
      ? event.attendees.map(a => a?.email).filter(Boolean)
      : []

  const formatTime = () => {
    const start = event?.start_ts ? new Date(event.start_ts) : null
    const end = event?.end_ts ? new Date(event.end_ts) : null
    if (!start || Number.isNaN(start.getTime())) return ''
    if (event?.is_all_day) {
      return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    }
    const date = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const endTime = end && !Number.isNaN(end.getTime()) ? end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null
    return endTime ? `${date} · ${startTime}–${endTime}` : `${date} · ${startTime}`
  }

  return (
    <div className="rounded-[18px] border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="h-1" style={{ backgroundColor: bg }} />
      <div className="bg-white dark:bg-gray-800">
        <div className="px-4 pt-3 pb-2">
          <div className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 truncate">
            {event.summary || event.title || 'Untitled event'}
          </div>
          {event.description && (
            <div className="mt-1 text-[13px] text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words">
              {event.description}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700" />
        <div className="px-4 py-2 text-[13px] text-gray-600 dark:text-gray-300">
          {formatTime()}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700" />
        <LocationSection
          location={event.location || ''}
          setLocation={() => {}}
          isGeneratingMeeting={false}
          tempEventId={null}
          handleGenerateMeetingLink={() => {}}
          cleanupTemporaryEvent={() => {}}
          setConferenceRequestId={() => {}}
          isReadOnly={true}
        />

        <div className="border-t border-gray-100 dark:border-gray-700" />
        <div className="px-4 py-3">
          {participants.length > 0 ? (
            <ParticipantChips
              visibleParticipants={participants}
              selectedEvent={{ ...event, attendees: event.attendees || [] }}
              user={{ email: '' }}
              expandedChips={new Set()}
              toggleChip={() => {}}
              handleRemoveParticipant={() => {}}
            />
          ) : (
            <div className="text-sm text-gray-400">Participants</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EventModalPreview
