import { createPortal } from 'react-dom'
import { CATEGORY_COLORS } from './constants'

const ColorPickerDropdown = ({
  colorPickerDropdownRef,
  colorPickerDropdownCoords,
  color,
  setColor,
  setShowColorPicker
}) => {
  return createPortal(
    <div
      className="fixed z-[1100]"
      style={{
        top: colorPickerDropdownCoords.top,
        left: colorPickerDropdownCoords.left,
        transform: colorPickerDropdownCoords.placement === 'top' ? 'translateY(-100%)' : 'none'
      }}
    >
      <div
        ref={colorPickerDropdownRef}
        className="bg-white border border-gray-200 rounded-2xl shadow-xl p-3 modal-fade-in"
        style={{ width: 192 }}
      >
        <div className="grid grid-cols-4 gap-2">
          {CATEGORY_COLORS.map((colorOption) => (
            <button
              key={colorOption.name}
              type="button"
              onClick={() => {
                setColor(colorOption.name)
                setShowColorPicker(false)
              }}
              className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                color === colorOption.name ? 'ring-2 ring-gray-400 ring-offset-2 ring-offset-white' : ''
              }`}
              style={{ backgroundColor: colorOption.hex }}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ColorPickerDropdown
