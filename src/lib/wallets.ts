/*
 * Personal wallets (groups of type 'personal'). A person can keep several, e.g. Fuel, Groceries
 * and Shopping, each with its own budget. The first one is "My spending" by default; later ones
 * need a name of their own.
 */

type WalletLike = { id: string; type?: string; archived?: boolean }

/** The name a first wallet gets when the name field is left empty. */
export const FIRST_WALLET_NAME = 'My spending'
/** Name field placeholder for a second or later wallet (no default name). */
export const MORE_WALLETS_PLACEHOLDER = 'Fuel, Groceries, Shopping…'

/** The person's open (not archived) wallets, in the order given. */
export const walletsOf = <G extends WalletLike>(groups: readonly G[]): G[] => groups.filter((g) => g.type === 'personal' && !g.archived)

/**
 * Name field behaviour in the group form for a wallet, given how many other wallets exist
 * (archived ones count, so a new wallet never repeats an archived "My spending").
 */
export function walletNaming(otherWallets: number): { placeholder: string; fallbackName: string } {
  return otherWallets > 0 ? { placeholder: MORE_WALLETS_PLACEHOLDER, fallbackName: '' } : { placeholder: FIRST_WALLET_NAME, fallbackName: FIRST_WALLET_NAME }
}

/** Where "Personal" on a captured payment goes: a new "My spending", the only wallet, or a choice. */
export type JustMeTarget<G> = { kind: 'create' } | { kind: 'open'; id: string } | { kind: 'pick'; wallets: G[] }

export function justMeTarget<G extends WalletLike>(groups: readonly G[]): JustMeTarget<G> {
  const wallets = walletsOf(groups)
  if (!wallets.length) return { kind: 'create' }
  if (wallets.length === 1) return { kind: 'open', id: wallets[0].id }
  return { kind: 'pick', wallets }
}
