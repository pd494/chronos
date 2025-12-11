import { useState, useCallback, useLayoutEffect, useEffect, useRef } from 'react'
import { DEFAULT_MODAL_DIMENSIONS, MIN_MODAL_WIDTH, MIN_MODAL_HEIGHT, VIEWPORT_MARGIN, MODAL_SIDE_OFFSET } from './constants'

export const getModalPosition = (view, dimensions = DEFAULT_MODAL_DIMENSIONS) => {
  if (typeof window === 'undefined') {
    const fallbackWidth = dimensions?.width || DEFAULT_MODAL_DIMENSIONS.width
    const fallbackHeight = dimensions?.height || DEFAULT_MODAL_DIMENSIONS.height
    return {
      top: 0, left: 0, pointerSide: null,
      pointerOffset: (fallbackHeight || 0) / 2,
      width: fallbackWidth || DEFAULT_MODAL_DIMENSIONS.width,
      maxHeight: fallbackHeight || DEFAULT_MODAL_DIMENSIONS.height
    }
  }

  const viewportHeight = Math.max(window.innerHeight || document.documentElement?.clientHeight || 0, 0)
  const viewportWidth = Math.max(window.innerWidth || document.documentElement?.clientWidth || 0, 0)
  const scrollTop = window.pageYOffset || document.documentElement?.scrollTop || 0
  const scrollLeft = window.pageXOffset || document.documentElement?.scrollLeft || 0

  const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return min
    if (max < min) return min
    return Math.min(Math.max(value, min), max)
  }

  const normalizeWidth = (rawWidth) => {
    const availableWidth = Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2)
    if (availableWidth === 0) return rawWidth || DEFAULT_MODAL_DIMENSIONS.width
    const desired = rawWidth || DEFAULT_MODAL_DIMENSIONS.width
    const minWidth = Math.min(MIN_MODAL_WIDTH, availableWidth)
    return Math.max(Math.min(desired, availableWidth), minWidth)
  }

  const normalizeHeight = (rawHeight) => {
    const availableHeight = Math.max(0, viewportHeight - VIEWPORT_MARGIN * 2)
    if (availableHeight === 0) return availableHeight
    if (rawHeight === 'auto') return availableHeight
    const desired = rawHeight || availableHeight
    const minHeight = Math.min(MIN_MODAL_HEIGHT, availableHeight || MIN_MODAL_HEIGHT)
    return Math.max(Math.min(desired, availableHeight), minHeight)
  }

  let modalWidth = normalizeWidth(dimensions?.width)
  let modalHeight = normalizeHeight(dimensions?.height)

  const resolveAnchorRect = () => {
    let anchor = null
    if (window.lastCalendarAnchorRect && Number.isFinite(window.lastCalendarAnchorRect.top)) {
      anchor = window.lastCalendarAnchorRect
    } else {
      const fallbackElement = window.lastClickedEvent || window.lastClickedCalendarDay
      if (fallbackElement) {
        const rect = fallbackElement.getBoundingClientRect()
        anchor = {
          top: rect.top + scrollTop, bottom: rect.bottom + scrollTop,
          left: rect.left + scrollLeft, right: rect.right + scrollLeft,
          width: rect.width, height: rect.height
        }
      }
    }
    if (!anchor) return null
    const height = anchor.height ?? Math.max((anchor.bottom ?? 0) - (anchor.top ?? 0), 1)
    const width = anchor.width ?? Math.max((anchor.right ?? 0) - (anchor.left ?? 0), 1)
    const top = (anchor.top ?? 0) - scrollTop
    const left = (anchor.left ?? 0) - scrollLeft
    return { top, bottom: top + height, left, right: left + width, width, height }
  }

  const anchorRect = resolveAnchorRect()

  const fallbackCentered = () => {
    const bottomMargin = Math.max(VIEWPORT_MARGIN, 40)
    const bottomTop = viewportHeight
      ? clamp(viewportHeight - modalHeight - bottomMargin, VIEWPORT_MARGIN, viewportHeight - modalHeight - VIEWPORT_MARGIN)
      : VIEWPORT_MARGIN
    const rightOffset = 150
    const centeredLeft = viewportWidth
      ? clamp((viewportWidth - modalWidth) / 2 + rightOffset, VIEWPORT_MARGIN, viewportWidth - modalWidth - VIEWPORT_MARGIN)
      : VIEWPORT_MARGIN
    return { top: bottomTop, left: centeredLeft, pointerSide: null, pointerOffset: modalHeight / 2, width: modalWidth, maxHeight: modalHeight }
  }

  if (!anchorRect) return fallbackCentered()

  const centerLeft = anchorRect.left + (anchorRect.width / 2) - (modalWidth / 2)
  let left = clamp(centerLeft, VIEWPORT_MARGIN, viewportWidth - modalWidth - VIEWPORT_MARGIN)
  const preferredTop = anchorRect.top - MODAL_SIDE_OFFSET - modalHeight
  let top = preferredTop >= VIEWPORT_MARGIN ? preferredTop : anchorRect.bottom + MODAL_SIDE_OFFSET
  top = clamp(top, VIEWPORT_MARGIN, viewportHeight - modalHeight - VIEWPORT_MARGIN)

  return { top, left, pointerSide: null, pointerOffset: modalHeight / 2, width: modalWidth, maxHeight: modalHeight }
}

export const useModalPosition = ({ modalRef, view, selectedEvent, internalVisible }) => {
  const [modalPosition, setModalPosition] = useState(() => getModalPosition(view, DEFAULT_MODAL_DIMENSIONS))
  const hasRenderedOnceRef = useRef(false)

  const measureModalSize = useCallback(() => {
    const node = modalRef.current
    if (!node) return DEFAULT_MODAL_DIMENSIONS
    const rect = node.getBoundingClientRect()
    return { width: rect.width || DEFAULT_MODAL_DIMENSIONS.width, height: rect.height || DEFAULT_MODAL_DIMENSIONS.height }
  }, [modalRef])

  const updateModalPosition = useCallback(() => {
    setModalPosition(getModalPosition(view, measureModalSize()))
  }, [measureModalSize, view])

  useLayoutEffect(() => {
    if (!hasRenderedOnceRef.current) {
      hasRenderedOnceRef.current = true
      return
    }
    updateModalPosition()
  }, [updateModalPosition])

  useEffect(() => {
    hasRenderedOnceRef.current = false
    updateModalPosition()
    document.body.style.overflowX = 'hidden'
    return () => { document.body.style.overflowX = '' }
  }, [view, selectedEvent, updateModalPosition])

  useEffect(() => {
    if (!internalVisible) return
    updateModalPosition()
  }, [internalVisible, updateModalPosition])

  useEffect(() => {
    const handleResize = () => updateModalPosition()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateModalPosition])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const node = modalRef.current
    if (!node) return undefined
    const setupTimer = setTimeout(() => {
      if (!hasRenderedOnceRef.current) return
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => updateModalPosition())
      })
      observer.observe(node)
      node._resizeObserver = observer
    }, 200)
    return () => {
      clearTimeout(setupTimer)
      if (node._resizeObserver) {
        node._resizeObserver.disconnect()
        delete node._resizeObserver
      }
    }
  }, [updateModalPosition, modalRef])

  return { modalPosition, updateModalPosition }
}
