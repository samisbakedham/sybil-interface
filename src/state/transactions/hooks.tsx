import { TransactionResponse } from '@ethersproject/providers'
import { useCallback, useMemo, useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { useActiveWeb3React } from '../../hooks'
import { AppDispatch, AppState } from '../index'
import { addTransaction } from './actions'
import { TransactionDetails } from './reducer'
import { useTwitterAccount } from '../user/hooks'
import { newTransactionsFirst } from '../../components/Web3Status'

export interface CustomData {
  summary?: string
  approval?: { tokenAddress: string; spender: string }
  claim?: { recipient: string }
  social?: { username: string; account: string }
}

// helper that can take a ethers library transaction response and add it to the list of transactions
export function useTransactionAdder(): (response: TransactionResponse, customData?: CustomData) => void {
  const { chainId, account } = useActiveWeb3React()
  const dispatch = useDispatch<AppDispatch>()

  return useCallback(
    (response: TransactionResponse, { summary, approval, claim, social }: CustomData = {}) => {
      if (!account) return
      if (!chainId) return

      const { hash } = response
      if (!hash) {
        throw Error('No transaction hash found.')
      }
      dispatch(addTransaction({ hash, from: account, chainId, approval, summary, claim, social }))
    },
    [dispatch, chainId, account]
  )
}

// returns all the transactions for the current chain
export function useAllTransactions(): { [txHash: string]: TransactionDetails } {
  const { chainId } = useActiveWeb3React()

  const state = useSelector<AppState, AppState['transactions']>(state => state.transactions)

  return chainId ? state[chainId] ?? {} : {}
}

export function useIsTransactionPending(transactionHash?: string): boolean {
  const transactions = useAllTransactions()

  if (!transactionHash || !transactions[transactionHash]) return false

  return !transactions[transactionHash].receipt
}

/**
 * Returns whether a transaction happened in the last day (86400 seconds * 1000 milliseconds / second)
 * @param tx to check for recency
 */
export function isTransactionRecent(tx: TransactionDetails): boolean {
  return new Date().getTime() - tx.addedTime < 86_400_000
}

// returns whether a token has a pending approval transaction
export function useHasPendingApproval(tokenAddress: string | undefined, spender: string | undefined): boolean {
  const allTransactions = useAllTransactions()
  return useMemo(
    () =>
      typeof tokenAddress === 'string' &&
      typeof spender === 'string' &&
      Object.keys(allTransactions).some(hash => {
        const tx = allTransactions[hash]
        if (!tx) return false
        if (tx.receipt) {
          return false
        } else {
          const approval = tx.approval
          if (!approval) return false
          return approval.spender === spender && approval.tokenAddress === tokenAddress && isTransactionRecent(tx)
        }
      }),
    [allTransactions, spender, tokenAddress]
  )
}

// watch for submissions to claim
// return null if not done loading, return undefined if not found
export function useUserHasSubmittedClaim(
  account?: string
): { claimSubmitted: boolean; claimTxn: TransactionDetails | undefined } {
  const allTransactions = useAllTransactions()

  // get the txn if it has been submitted
  const claimTxn = useMemo(() => {
    const txnIndex = Object.keys(allTransactions).find(hash => {
      const tx = allTransactions[hash]
      return tx.claim && tx.claim.recipient === account
    })
    return txnIndex && allTransactions[txnIndex] ? allTransactions[txnIndex] : undefined
  }, [account, allTransactions])

  return { claimSubmitted: Boolean(claimTxn), claimTxn }
}

export function useVerifcationConfirmed(): boolean | undefined {
  // get account info to check against
  const { account } = useActiveWeb3React()
  const [twitterAccount] = useTwitterAccount()

  // monitor for pending attempt to verify, pull out profile if so
  const allTransactions = useAllTransactions()

  const [pending, setPending] = useState<TransactionDetails | undefined>()

  const sortedRecentTransactions: TransactionDetails[] = useMemo(() => {
    return Object.values(allTransactions)
      .filter(isTransactionRecent)
      .sort(newTransactionsFirst)
  }, [allTransactions])

  const relevantTxns = sortedRecentTransactions.filter(
    tx => tx.social && tx.social.account === account && tx.social.username === twitterAccount
  )
  const pendingVerifications = sortedRecentTransactions.filter(tx => !tx.receipt && tx.social)
  const pendingVerification = pendingVerifications?.[0]

  useEffect(() => {
    if (pendingVerification) {
      setPending(pendingVerification)
    }
  }, [pendingVerification])

  const recentlyVerified = relevantTxns.filter(t => !!t.receipt)?.[0]

  return !!pending && !!recentlyVerified
}

export function useUserPendingUsername(): { pendingProfile: string | undefined } {
  // get account info to check against
  const { account } = useActiveWeb3React()
  const [twitterAccount] = useTwitterAccount()

  // monitor for pending attempt to verify, pull out profile if so
  const allTransactions = useAllTransactions()

  const sortedRecentTransactions: TransactionDetails[] = useMemo(() => {
    return Object.values(allTransactions)
      .filter(isTransactionRecent)
      .sort(newTransactionsFirst)
  }, [allTransactions])

  const relevantTxns = sortedRecentTransactions.filter(
    tx => tx.social && tx.social.account === account && tx.social.username === twitterAccount
  )
  const pendingVerifications = relevantTxns.filter(tx => !tx.receipt && tx.social)
  const pendingProfile = pendingVerifications?.[0]?.social?.username

  return {
    pendingProfile
  }
}
