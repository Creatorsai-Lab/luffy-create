import { useEffect, useState } from 'react'
import { create } from 'zustand'

interface ToastMessage {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  duration?: number
}

interface ToastState {
  toasts: ToastMessage[]
  addToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', duration = 3000) => {
    const id = `${Date.now()}-${Math.random()}`
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }]
    }))
    // Auto-remove after duration
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter(t => t.id !== id)
      }))
    }, duration)
  },
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  }))
}))

export default function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

function Toast({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const bgColor = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600'
  }[toast.type]

  return (
    <div
      className={`
        px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium
        transition-all duration-300 transform
        ${bgColor}
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}
      `}
      onClick={onClose}
      style={{ cursor: 'pointer', minWidth: '250px', maxWidth: '400px' }}
    >
      {toast.message}
    </div>
  )
}

// Helper function for easy use
export const toast = {
  success: (message: string, duration?: number) => 
    useToastStore.getState().addToast(message, 'success', duration),
  error: (message: string, duration?: number) => 
    useToastStore.getState().addToast(message, 'error', duration),
  info: (message: string, duration?: number) => 
    useToastStore.getState().addToast(message, 'info', duration)
}
