import { FiCheck, FiX, FiXCircle } from 'react-icons/fi'
import { getInitials, getParticipantColor } from './constants'

const ParticipantChips = ({
  visibleParticipants,
  selectedEvent,
  user,
  expandedChips,
  toggleChip,
  handleRemoveParticipant
}) => {
  const isOrganizer = selectedEvent?.viewerIsOrganizer || !selectedEvent

  // Get connected account emails from window or localStorage
  const getConnectedAccountEmails = () => {
    if (typeof window !== 'undefined' && window.chronosAccountEmails) {
      return window.chronosAccountEmails
    }
    try {
      const stored = window?.localStorage?.getItem('chronos:account-emails')
      return stored ? JSON.parse(stored) : []
    } catch (_) {
      return []
    }
  }
  const connectedEmails = getConnectedAccountEmails()

  // Filter out the organizer from the list if:
  // 1. The viewer is the organizer (viewerIsOrganizer === true)
  // 2. OR the organizer email is in the list of connected account emails
  const organizerEmail = selectedEvent?.organizerEmail

  const displayParticipants = visibleParticipants.filter(email => {
    if (!organizerEmail || email !== organizerEmail) return true
    // Hide organizer if: viewer is organizer
    if (isOrganizer) return false
    // Hide organizer if their email is in our connected accounts
    if (connectedEmails.some(e => e.toLowerCase() === organizerEmail.toLowerCase())) return false
    return true
  })

  const hasAttendeeData = selectedEvent?.attendees && Array.isArray(selectedEvent.attendees)
  const attendeesMap = hasAttendeeData ? new Map(selectedEvent.attendees.map(a => [a.email, a])) : new Map()
  const goingCount = hasAttendeeData ? selectedEvent.attendees.filter(a => a.responseStatus === 'accepted').length : 0

  let declinedCount = 0
  displayParticipants.forEach(email => {
    const attendee = attendeesMap.get(email)
    if (attendee?.responseStatus === 'declined') declinedCount++
  })

  let awaitingCount = 0
  displayParticipants.forEach(email => {
    const attendee = attendeesMap.get(email)
    if (!attendee) awaitingCount++
    else {
      const status = attendee.responseStatus
      if (status !== 'accepted' && status !== 'declined') awaitingCount++
    }
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center">
        {displayParticipants.slice(0, 5).map((email, index) => {
          const bgColor = getParticipantColor(email)
          const attendee = attendeesMap.get(email)
          const isAccepted = attendee?.responseStatus === 'accepted'
          const isDeclined = attendee?.responseStatus === 'declined'

          return (
            <div key={email} className="relative group" style={{ marginLeft: index > 0 ? '-8px' : '0', zIndex: 5 - index }}>
              <button
                type="button"
                onClick={() => toggleChip(email)}
                className="rounded-full text-xs font-semibold text-white flex items-center justify-center focus:outline-none border-2 border-white relative"
                style={{ backgroundColor: bgColor, width: '33.6px', height: '33.6px' }}
                aria-label={`Toggle ${email}`}
                title={email}
              >
                {getInitials(email)}
              </button>
              {isAccepted && (
                <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center border border-white">
                  <FiCheck size={10} className="text-white" strokeWidth={3} />
                </div>
              )}
              {isDeclined && (
                <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center border border-white">
                  <FiX size={10} className="text-white" strokeWidth={3} />
                </div>
              )}
              {isOrganizer && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemoveParticipant(email) }}
                  className="absolute -bottom-1 -right-1 w-4 h-4 bg-white hover:bg-red-50 rounded-full flex items-center justify-center border border-gray-300 hover:border-red-400 shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-150 z-10"
                  aria-label={`Remove ${email}`}
                  title={`Remove ${email}`}
                >
                  <FiXCircle size={10} className="text-gray-600 hover:text-red-600" strokeWidth={2.5} />
                </button>
              )}
            </div>
          )
        })}
        {displayParticipants.length > 5 && (
          <div className="rounded-full text-xs font-semibold bg-gray-200 text-gray-600 flex items-center justify-center border-2 border-white"
            style={{ marginLeft: '-5px', zIndex: 0, width: '33.6px', height: '33.6px' }}>
            +{displayParticipants.length - 5}
          </div>
        )}
        {(goingCount > 0 || declinedCount > 0 || awaitingCount > 0) && (
          <div className="text-xs text-gray-500 ml-2">
            {goingCount > 0 && `${goingCount} going`}
            {goingCount > 0 && (declinedCount > 0 || awaitingCount > 0) && ', '}
            {declinedCount > 0 && `${declinedCount} declined`}
            {declinedCount > 0 && awaitingCount > 0 && ', '}
            {awaitingCount > 0 && `${awaitingCount} awaiting`}
          </div>
        )}
      </div>
      {expandedChips.size > 0 && (
        <div className="pt-1">
          <span className="text-xs text-gray-600">
            {displayParticipants.filter(email => expandedChips.has(email)).map((email, index, array) => {
              const isOrganizerEmail = selectedEvent?.organizerEmail === email && email !== user?.email
              const attendee = attendeesMap.get(email)
              const isAccepted = attendee?.responseStatus === 'accepted'
              return (
                <span key={email} className={isOrganizerEmail ? "font-semibold text-gray-900" : ""}>
                  {email}
                  {isOrganizerEmail && " (Organizer)"}
                  {isAccepted && <FiCheck className="inline ml-1 text-green-500" size={12} strokeWidth={3} />}
                  {index < array.length - 1 && <span className="font-normal text-gray-600">, </span>}
                </span>
              )
            })}
          </span>
        </div>
      )}
    </div>
  )
}

export default ParticipantChips
