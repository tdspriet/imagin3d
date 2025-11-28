import React from 'react'
import { MdClose, MdCheck } from 'react-icons/md'
import './ConfirmationBar.css'

function ConfirmationBar({ onConfirm, onCancel, isVisible }) {
  if (!isVisible) return null

  return (
    <div className="confirmation-bar">
      <span className="confirmation-bar__message">
        Review the assigned weights. Confirm to continue or cancel to stop.
      </span>
      <div className="confirmation-bar__actions">
        <button
          className="confirmation-bar__button confirmation-bar__button--cancel"
          onClick={onCancel}
          title="Cancel generation"
        >
          <MdClose size={16} />
          Cancel
        </button>
        <button
          className="confirmation-bar__button confirmation-bar__button--confirm"
          onClick={onConfirm}
          title="Confirm and continue"
        >
          <MdCheck size={16} />
          Confirm
        </button>
      </div>
    </div>
  )
}

export default ConfirmationBar
