import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, HandCoins, Plus, Receipt, SendHorizontal, Share2 } from 'lucide-react'
import type { Cents, ChatMessage, Expense, Group, OpenItem } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { CHAT_MAX, cleanMessage } from '@/lib/chat'
import { formatDate } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { MoneyInput } from '@/components/MoneyInput'
import { Sheet } from '@/components/Sheet'
import { OpenItemSheet } from '@/features/open-items/OpenItemSheet'

type Draft = Omit<ChatMessage, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'pending'>

/** Phones get a newline from Enter (Send is the button); a keyboard and mouse send with Enter. */
const enterSends = () => typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches

/**
 * The message box and its ＋ tools: an open item (anyone can claim it from the chat), a Pay me
 * request, Add expense (its card lands back here), or a card for an expense already added.
 */
export function Composer({ group, expenses, openItemsOn, onSend }: { group: Group; expenses: Expense[]; openItemsOn: boolean; onSend: (m: Draft) => void }) {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [tool, setTool] = useState<'menu' | 'open' | 'pay' | 'share' | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const clean = cleanMessage(text)

  // Grow with the text, up to about five lines.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on every change of the text
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [text])

  const send = () => {
    if (!clean) return
    onSend({ kind: 'text', text: clean })
    setText('')
    area.current?.focus()
  }
  // A card carries what was typed as its words (so "who paid for this?" goes with the open item).
  const sendCard = (m: Omit<Draft, 'text'>) => {
    onSend({ ...m, text: clean })
    setText('')
    setTool(null)
  }

  return (
    <div className="border-t border-slate-200/70 bg-slate-50/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl dark:border-white/5 dark:bg-ink-950/95">
      <form
        className="mx-auto flex max-w-2xl items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <button
          type="button"
          onClick={() => setTool('menu')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-ink-800"
          aria-label="Add an open item, Pay me or an expense"
          aria-haspopup="dialog"
          data-testid="chat-tools"
        >
          <Plus size={24} aria-hidden />
        </button>
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          ref={area}
          rows={1}
          value={text}
          maxLength={CHAT_MAX + 200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && enterSends()) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Message about money"
          className="min-h-11 flex-1 resize-none rounded-3xl border-0 bg-white px-4 py-2.5 text-[15px] leading-snug shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500 dark:bg-ink-800 dark:ring-white/10"
          data-testid="chat-input"
        />
        <button
          type="submit"
          disabled={!clean}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-on-fill disabled:opacity-40"
          aria-label="Send"
          data-testid="chat-send"
        >
          <SendHorizontal size={20} aria-hidden />
        </button>
      </form>

      <Sheet open={tool === 'menu'} onClose={() => setTool(null)} title="Add to the chat" testId="chat-tools-sheet">
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
          {openItemsOn && (
            <ToolRow
              icon={<ClipboardList size={20} />}
              label="Open item"
              hint="Not sure who paid or how much? Anyone can claim it from here."
              onClick={() => setTool('open')}
              testId="chat-tool-open"
            />
          )}
          <ToolRow
            icon={<HandCoins size={20} />}
            label="Pay me"
            hint="Ask the group to pay you an amount."
            onClick={() => setTool('pay')}
            testId="chat-tool-pay"
          />
          <ToolRow
            icon={<Receipt size={20} />}
            label="Add expense"
            hint="Add it now; its card shows up here."
            onClick={() => {
              setTool(null)
              nav(`/add?group=${encodeURIComponent(group.id)}&chat=1`)
            }}
            testId="chat-tool-expense"
          />
          <ToolRow
            icon={<Share2 size={20} />}
            label="Share an expense"
            hint="Point the group at one that’s already added."
            onClick={() => setTool('share')}
            testId="chat-tool-share"
          />
        </ul>
      </Sheet>

      {openItemsOn && (
        <OpenItemSheet
          open={tool === 'open'}
          onClose={() => setTool(null)}
          group={group}
          // What's in the box is probably the item ("lunch oct 2 cafe blue"): start from it.
          initial={{ title: clean, date: undefined }}
          onSaved={(item: OpenItem, isNew) => {
            if (!isNew) return
            onSend({ kind: 'openItem', ref: item.id, text: clean && clean !== item.title ? clean : '' })
            setText('')
          }}
        />
      )}
      <PaySheet open={tool === 'pay'} onClose={() => setTool(null)} group={group} onPay={(amount) => sendCard({ kind: 'pay', amount })} />
      <ShareSheet
        open={tool === 'share'}
        onClose={() => setTool(null)}
        group={group}
        expenses={expenses}
        onPick={(e) => sendCard({ kind: 'expense', ref: e.id })}
      />
    </div>
  )
}

function ToolRow({ icon, label, hint, onClick, testId }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void; testId?: string }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-2 py-2.5 text-left" data-testid={testId}>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-200"
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          <span className="text-muted block text-xs">{hint}</span>
        </span>
      </button>
    </li>
  )
}

function PaySheet({ open, onClose, group, onPay }: { open: boolean; onClose: () => void; group: Group; onPay: (amount: Cents) => void }) {
  const [amount, setAmount] = useState<Cents | undefined>(undefined)
  useEffect(() => {
    if (open) setAmount(undefined)
  }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="Pay me">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (amount && amount > 0) onPay(amount)
        }}
      >
        <p className="text-muted -mt-1 mb-3 text-sm">Everyone in the group sees a card with a Pay button that opens Settle up, filled in.</p>
        <label htmlFor="chat-pay-amount" className="label">
          Amount
        </label>
        <MoneyInput
          id="chat-pay-amount"
          currency={group.currency}
          value={amount}
          onChange={setAmount}
          placeholder="0"
          autoFocus
          data-testid="chat-pay-amount"
        />
        <button type="submit" className="btn-primary mt-4 w-full" disabled={!amount || amount <= 0} data-testid="chat-pay-send">
          Send {amount ? formatMoney(amount, group.currency) : ''} request
        </button>
      </form>
    </Sheet>
  )
}

function ShareSheet({
  open,
  onClose,
  group,
  expenses,
  onPick,
}: {
  open: boolean
  onClose: () => void
  group: Group
  expenses: Expense[]
  onPick: (e: Expense) => void
}) {
  const live = expenses.filter((e) => typeof e.deletedAt !== 'number').slice(0, 30)
  return (
    <Sheet open={open} onClose={onClose} title="Share an expense">
      {live.length === 0 ? (
        <p className="text-muted text-sm">No expenses in this group yet.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
          {live.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onPick(e)} className="flex min-h-12 w-full items-center gap-3 px-2 py-2 text-left">
                <span className="text-xl" aria-hidden>
                  {CATEGORIES[e.category].emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.description}</span>
                  <span className="text-muted block text-xs">{formatDate(e.date, 'day')}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatMoney(e.amount, group.currency)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
