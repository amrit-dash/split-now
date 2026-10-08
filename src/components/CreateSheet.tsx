import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, ChevronRight, Plus, QrCode, ScanLine, Users } from 'lucide-react'
import { Sheet } from './Sheet'

/**
 * What the + button in the tab bar opens: the one place to start anything. Add expense is the
 * big first choice (it's what people do most); inside a group, every option opens for that group.
 */
export function CreateSheet({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId?: string }) {
  const nav = useNavigate()
  const q = groupId ? `?group=${encodeURIComponent(groupId)}` : ''
  const go = (to: string) => { onClose(); nav(to) }
  return (
    <Sheet open={open} onClose={onClose} title="Create">
      <button onClick={() => go(`/add${q}`)} data-testid="create-expense"
        className="flex w-full items-center gap-3 accent-live rounded-3xl bg-gradient-to-r from-brand-600 to-duo-600 p-4 text-left text-white shadow-lg shadow-brand-600/25 transition active:scale-[0.98]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><Plus size={26} strokeWidth={2.6} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold">Add expense</span>
          <span className="block text-sm text-white/80">Log what you paid and split it</span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-white/70" />
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile icon={<QrCode size={22} />} title="Split a bill" text="Everyone taps what they had" onClick={() => go(`/split${q}`)} testId="create-split" />
        <Tile icon={<ScanLine size={22} />} title="Scan" text="Receipt, statement or payment" onClick={() => go('/scan')} testId="create-scan" />
        <Tile icon={<Users size={22} />} title="New group" text="Trip, flat, dinner, anything" onClick={() => go('/groups/new')} testId="create-group" />
        <Tile icon={<ArrowRightLeft size={22} />} title="Settle up" text="Record a payment" onClick={() => go(groupId ? `/groups/${encodeURIComponent(groupId)}/settle` : '/settle')} testId="create-settle" />
      </div>
    </Sheet>
  )
}

function Tile({ icon, title, text, onClick, testId }: { icon: ReactNode; title: string; text: string; onClick: () => void; testId: string }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className="flex flex-col items-start gap-2 rounded-3xl bg-slate-50 p-3.5 text-left ring-1 ring-slate-900/5 transition active:scale-[0.98] dark:bg-ink-800 dark:ring-white/5">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs leading-snug text-slate-500">{text}</span>
      </span>
    </button>
  )
}
