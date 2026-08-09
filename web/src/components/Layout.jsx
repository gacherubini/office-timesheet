import { Topbar } from './Topbar'
import { ClockInReminder } from './ClockInReminder'
import AgentWidget from './AgentWidget'

export function Layout({ children }) {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Topbar />
      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      <ClockInReminder />
      <AgentWidget />
    </div>
  )
}
