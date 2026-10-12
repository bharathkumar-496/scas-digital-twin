import { useEffect, useRef, useState } from 'react'
import { BottomRightDock } from './components/BottomRightDock'
import { CameraToolRail, FloatingMetricsHUD, FloorControls, LeftSidebar, TelemetryPill } from './components/Chrome'
import { CCTVModal, ClassroomModal, IntroModal, TeamModal } from './components/Modals'
import { FireDrillBanner, TourOverlay } from './components/Overlays'
import { Inspector } from './components/RightAnalytics'
import { TopNav } from './components/TopNav'
import { startSimulation } from './lib/sim'
import { store, useApp } from './state/store'
import { Engine } from './three/Engine'

function Scene() {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!host.current) return
    let engine: Engine | null = null
    try {
      engine = new Engine(host.current)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WebGL unavailable')
    }
    return () => engine?.dispose()
  }, [])
  return (
    <div ref={host} className="absolute inset-0" aria-label="3D digital twin viewport">
      {error && (
        <div className="grid h-full place-items-center text-center text-sub">
          <div>
            <div className="text-[15px] font-semibold text-ink">WebGL could not start</div>
            <div className="mt-1 text-[12px]">{error}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const theme = useApp((s) => s.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#05070a' : '#e4e5f7')
  }, [theme])

  useEffect(() => startSimulation(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = store.get()
      if (s.cctvModal) store.set({ cctvModal: null })
      else if (s.classroomModal) store.set({ classroomModal: null })
      else if (s.teamOpen) store.set({ teamOpen: false })
      else if (s.introOpen) store.set({ introOpen: false })
      else if (s.layersDrawer) store.set({ layersDrawer: false })
      else if (s.selection) store.set({ selection: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="relative h-full w-full overflow-hidden bg-bg0 text-ink">
      <Scene />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.35))] light:bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(79,70,229,0.08))]" />
      <div className="pointer-events-none absolute inset-0">
        <TopNav />
        <FloatingMetricsHUD />
        <LeftSidebar />
        <CameraToolRail />
        <aside className="pointer-events-none absolute bottom-4 right-4 top-[76px] z-20 flex w-[340px] flex-col gap-3" style={{ maxHeight: 'calc(100vh - 80px)' }}>
          <Inspector />
          <BottomRightDock />
        </aside>
        <FloorControls />
        <TelemetryPill />
        <FireDrillBanner />
        <TourOverlay />
      </div>
      <IntroModal />
      <ClassroomModal />
      <CCTVModal />
      <TeamModal />
    </main>
  )
}
