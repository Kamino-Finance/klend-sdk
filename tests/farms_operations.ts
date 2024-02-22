import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Env } from './setup_utils';
import { initFarmsForReserve, InitFarmsForReserveAccounts, LendingMarket, lendingMarketAuthPda } from '../src';
import { ReserveFarmKind } from '../src/idl_codegen/types';
import { buildAndSendTxnWithLogs, buildVersionedTransaction } from '../src/utils';
import { farmsId, getFarmAuthorityPDA } from '@hubbleprotocol/farms-sdk';
import base58 from 'bs58';
import { base64 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';

export async function initializeFarmsForReserve(
  env: Env,
  lendingMarket: PublicKey,
  reserve: PublicKey,
  kind: string,
  multisig: PublicKey | null,
  simulate: boolean,
  farmsGlobalConfigOverride?: string
) {
  const farmsGlobalConfig = farmsGlobalConfigOverride ?? '6UodrBjL2ZreDy7QdR4YV1oxqMBjVYSEyrFpctqqwGwL';

  const [lendingMarketAuthority, _] = lendingMarketAuthPda(lendingMarket, env.program.programId);

  const lendingMarketOwner = (await LendingMarket.fetch(env.provider.connection, lendingMarket))?.lendingMarketOwner!;

  const SIZE_FARM_STATE = 8336;
  const farmState: Keypair = Keypair.generate();
  const createFarmIx = SystemProgram.createAccount({
    fromPubkey: multisig ? multisig : env.admin.publicKey,
    newAccountPubkey: farmState.publicKey,
    space: SIZE_FARM_STATE,
    lamports: await env.provider.connection.getMinimumBalanceForRentExemption(SIZE_FARM_STATE),
    programId: farmsId,
  });

  const ix = initFarmsForReserve(
    {
      mode: ReserveFarmKind.fromDecoded({ [kind]: '' }).discriminator,
    },
    {
      lendingMarketOwner: lendingMarketOwner,
      lendingMarket,
      lendingMarketAuthority,
      reserve,
      farmsProgram: farmsId,
      farmsGlobalConfig: new PublicKey(farmsGlobalConfig),
      farmState: farmState.publicKey,
      farmsVaultAuthority: getFarmAuthorityPDA(farmsId, farmState.publicKey),
      rent: SYSVAR_RENT_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    } as InitFarmsForReserveAccounts
  );

  const versionedTx = await buildVersionedTransaction(env.provider.connection, lendingMarketOwner, [createFarmIx, ix]);
  const { blockhash } = await env.provider.connection.getLatestBlockhash();
  const txn = new Transaction();
  txn.recentBlockhash = blockhash;
  txn.feePayer = lendingMarketOwner;
  txn.add(...[createFarmIx, ix]);

  if (simulate) {
    await simulateClientTransaction(env, versionedTx);
  } else {
    if (multisig) {
      console.log(base58.encode(txn.serializeMessage()));
    } else {
      if (!env.admin.publicKey.equals(lendingMarketOwner)) {
        throw new Error('Lending market owner must be the admin');
      }
      const sig = await buildAndSendTxnWithLogs(env.provider.connection, versionedTx, env.admin, [farmState], true);
      console.log('Transaction signature: ' + sig);
    }
  }
}

async function simulateClientTransaction(env: Env, tx: VersionedTransaction) {
  const txSimulate = await env.provider.connection.simulateTransaction(tx);
  console.log(txSimulate.value.logs);

  const baseUrl = 'https://explorer.solana.com/tx/inspector?';

  const sanitisedUrl = baseUrl + 'message=' + encodeURIComponent(base64.encode(Buffer.from(tx.message.serialize())));

  console.log('Simulation explorer URL: ', sanitisedUrl);
}
