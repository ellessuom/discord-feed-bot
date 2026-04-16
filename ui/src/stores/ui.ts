import { create } from 'zustand'

interface UIState {
  isAddModalOpen: boolean
  sidebarOpen: boolean

  openAddModal: () => void
  closeAddModal: () => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isAddModalOpen: false,
  sidebarOpen: true,

  openAddModal: () => set({ isAddModalOpen: true }),
  closeAddModal: () => set({ isAddModalOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}))
