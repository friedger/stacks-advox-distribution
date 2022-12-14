import {
  broadcastTransaction,
  SponsoredAuthorization,
  StacksTransaction,
  TxBroadcastResultOk,
  TxBroadcastResultRejected,
} from 'micro-stacks/transactions';
import { network } from './config';

export async function handleTransaction(transaction: StacksTransaction) {
  const result = await broadcastTransaction(transaction, network);
  console.log({
    txId: result,
    timestamp: new Date().toUTCString(),
    nonce: transaction.auth.spendingCondition?.nonce,
    sponsorNonce : (transaction.auth as SponsoredAuthorization).sponsorSpendingCondition?.nonce
  });
  if ((result as TxBroadcastResultRejected).error) {
    if ((result as TxBroadcastResultRejected).reason === 'ContractAlreadyExists') {
      console.log('already deployed');
      return {} as TxBroadcastResultOk;
    } else {
      throw new Error(
        `failed to handle transaction ${transaction.txid()}: ${JSON.stringify(result)}`
      );
    }
  }
  return result as TxBroadcastResultOk;
}
