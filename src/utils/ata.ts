import {
  AccountInfoBase,
  AccountInfoWithJsonData,
  AccountInfoWithPubkey,
  Address,
  Base58EncodedBytes,
  fetchEncodedAccount,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  GetTokenAccountBalanceApi,
  Instruction,
  Lamports,
  MaybeAccount,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
} from '@solana/kit';
import Decimal from 'decimal.js';
import { collToLamportsDecimal, DECIMALS_SOL } from '@kamino-finance/kliquidity-sdk/dist';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getSyncNativeInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  fetchMaybeToken,
  Token,
  getCloseAccountInstruction,
} from '@solana-program/token-2022';
import { WRAPPED_SOL_MINT } from './pubkey';
import { getTransferSolInstruction } from '@solana-program/system';

/**
 * Create an idempotent create ATA instruction
 * Overrides the create ATA ix to use the idempotent version as the spl-token library does not provide this ix yet
 * @param owner - owner of the ATA
 * @param mint - mint of the ATA
 * @param payer - payer of the transaction
 * @param tokenProgram - optional token program address - spl-token if not provided
 * @param ata - optional ata address - derived if not provided
 * @returns The ATA address public key and the transaction instruction
 */
export async function createAssociatedTokenAccountIdempotentInstruction(
  payer: TransactionSigner,
  mint: Address,
  owner: Address = payer.address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
  ata?: Address
): Promise<[Address, Instruction]> {
  let ataAddress = ata;
  if (!ataAddress) {
    ataAddress = await getAssociatedTokenAddress(mint, owner, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
  }
  const createUserTokenAccountIx = getCreateAssociatedTokenIdempotentInstruction(
    {
      owner,
      mint,
      tokenProgram,
      ata: ataAddress,
      payer,
    },
    {
      programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    }
  );
  return [ataAddress, createUserTokenAccountIx];
}

export async function getAssociatedTokenAddress(
  mint: Address,
  owner: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
  associatedTokenProgramId: Address = ASSOCIATED_TOKEN_PROGRAM_ADDRESS
): Promise<Address> {
  const [ata] = await findAssociatedTokenPda(
    {
      mint,
      owner,
      tokenProgram,
    },
    { programAddress: associatedTokenProgramId }
  );
  return ata;
}

export const getAtasWithCreateIxsIfMissing = async (
  rpc: Rpc<GetMultipleAccountsApi>,
  user: TransactionSigner,
  mints: Array<{ mint: Address; tokenProgram: Address }>
): Promise<{ atas: Address[]; createAtaIxs: Instruction[] }> => {
  const atas: Array<Address> = await Promise.all(
    mints.map(async (x) => getAssociatedTokenAddress(x.mint, user.address, x.tokenProgram))
  );
  const accountInfos = await rpc.getMultipleAccounts(atas).send();
  const createAtaIxs: Instruction[] = [];
  for (let i = 0; i < atas.length; i++) {
    if (accountInfos.value[i] === null) {
      const { mint, tokenProgram } = mints[i];
      const [ata, createIxn] = await createAssociatedTokenAccountIdempotentInstruction(
        user,
        mint,
        user.address,
        tokenProgram
      );
      atas[i] = ata;
      createAtaIxs.push(createIxn);
    }
  }
  return {
    atas,
    createAtaIxs,
  };
};

export async function createAtasIdempotent(
  user: TransactionSigner,
  mints: Array<{ mint: Address; tokenProgram: Address }>
): Promise<Array<{ ata: Address; createAtaIx: Instruction }>> {
  const res: Array<{ ata: Address; createAtaIx: Instruction }> = [];
  for (const mint of mints) {
    const [ata, createAtaIx] = await createAssociatedTokenAccountIdempotentInstruction(
      user,
      mint.mint,
      user.address,
      mint.tokenProgram
    );
    res.push({
      ata,
      createAtaIx,
    });
  }
  return res;
}

export function getTransferWsolIxs(owner: TransactionSigner, ata: Address, amountLamports: Lamports) {
  const ixs: Instruction[] = [];

  ixs.push(
    getTransferSolInstruction({
      source: owner,
      amount: amountLamports,
      destination: ata,
    })
  );

  ixs.push(
    getSyncNativeInstruction(
      {
        account: ata,
      },
      { programAddress: TOKEN_PROGRAM_ADDRESS }
    )
  );

  return ixs;
}

export async function getTokenAccountBalance(
  connection: Rpc<GetTokenAccountBalanceApi>,
  tokenAccount: Address
): Promise<number> {
  const tokenAccountBalance = await connection.getTokenAccountBalance(tokenAccount).send();

  return Number(tokenAccountBalance.value.amount).valueOf();
}

/// Get the balance of a token account in decimal format (tokens, not lamports)
export async function getTokenAccountBalanceDecimal(
  rpc: Rpc<GetAccountInfoApi & GetTokenAccountBalanceApi>,
  mint: Address,
  owner: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS
): Promise<Decimal> {
  const ata = await getAssociatedTokenAddress(mint, owner, tokenProgram);
  const accInfo = await fetchEncodedAccount(rpc, ata);
  if (!accInfo.exists) {
    return new Decimal('0');
  }
  const { value } = await rpc.getTokenAccountBalance(ata).send();
  return new Decimal(value.uiAmountString!);
}

export type CreateWsolAtaIxs = {
  wsolAta: Address;
  createAtaIxs: Instruction[];
  closeAtaIxs: Instruction[];
};

/**
 * Creates a wSOL ata if missing and syncs the balance. If the ata exists and it has more or equal no wrapping happens
 * @param rpc - Solana RPC rpc (read)
 * @param amount min amount to have in the wSOL ata. If the ata exists and it has more or equal no wrapping happens
 * @param owner - owner of the ata
 * @returns wsolAta: the keypair of the ata, used to sign the initialization transaction; createAtaIxs: a list with ixs to initialize the ata and wrap SOL if needed; closeAtaIxs: a list with ixs to close the ata
 */
export const createWsolAtaIfMissing = async (
  rpc: Rpc<GetAccountInfoApi & GetTokenAccountBalanceApi>,
  amount: Decimal,
  owner: TransactionSigner
): Promise<CreateWsolAtaIxs> => {
  const createIxs: Instruction[] = [];
  const closeIxs: Instruction[] = [];

  const wsolAta: Address = await getAssociatedTokenAddress(WRAPPED_SOL_MINT, owner.address, TOKEN_PROGRAM_ADDRESS);

  const solDeposit = amount;
  const wsolAtaAccountInfo: MaybeAccount<Token> = await fetchMaybeToken(rpc, wsolAta);
  // This checks if we need to create it
  if (wsolAtaAccountInfo.exists) {
    createIxs.push(
      getCreateAssociatedTokenIdempotentInstruction({
        owner: owner.address,
        payer: owner,
        ata: wsolAta,
        mint: WRAPPED_SOL_MINT,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
    );
  }

  let wsolExistingBalanceLamports = new Decimal(0);
  try {
    if (wsolAtaAccountInfo.exists) {
      const uiAmount = (await getTokenAccountBalanceDecimal(rpc, WRAPPED_SOL_MINT, owner.address)).toNumber();
      wsolExistingBalanceLamports = collToLamportsDecimal(new Decimal(uiAmount), DECIMALS_SOL);
    }
  } catch (err) {
    console.log('Err Token Balance', err);
  }

  if (solDeposit !== null && solDeposit.gt(wsolExistingBalanceLamports)) {
    createIxs.push(
      getTransferSolInstruction({
        source: owner,
        destination: wsolAta,
        amount: BigInt(solDeposit.sub(wsolExistingBalanceLamports).floor().toString()),
      })
    );
  }

  if (createIxs.length > 0) {
    // Primitive way of wrapping SOL
    createIxs.push(
      getSyncNativeInstruction(
        {
          account: wsolAta,
        },
        { programAddress: TOKEN_PROGRAM_ADDRESS }
      )
    );
  }

  closeIxs.push(
    getCloseAccountInstruction(
      {
        owner,
        account: wsolAta,
        destination: owner.address,
      },
      { programAddress: TOKEN_PROGRAM_ADDRESS }
    )
  );

  return {
    wsolAta,
    createAtaIxs: createIxs,
    closeAtaIxs: closeIxs,
  };
};

/**
 * Get all standard token accounts for tokens using old Token Program, not Token 2022 for a given wallet
 * @param rpc - Solana RPC rpc (read)
 * @param wallet - wallet to get the token accounts for
 * @returns an array of all token accounts for the given wallet
 */
export async function getAllStandardTokenProgramTokenAccounts(
  rpc: Rpc<SolanaRpcApi>,
  wallet: Address
): Promise<AccountInfoWithPubkey<AccountInfoBase & AccountInfoWithJsonData>[]> {
  return rpc
    .getProgramAccounts(TOKEN_PROGRAM_ADDRESS, {
      filters: [
        { dataSize: 165n },
        { memcmp: { offset: 32n, bytes: wallet.toString() as Base58EncodedBytes, encoding: 'base58' } },
      ],
      encoding: 'jsonParsed',
    })
    .send();
}

// Type definitions for parsed token account data
interface ParsedTokenAccountInfo {
  mint: string;
  owner: string;
  tokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

interface ParsedTokenAccountData {
  parsed: {
    info: ParsedTokenAccountInfo;
    type: string;
  };
  program: string;
  space: bigint;
}

// Type guard to check if account data is parsed
function isParsedTokenAccountData(data: any): data is ParsedTokenAccountData {
  return (
    data &&
    typeof data === 'object' &&
    'parsed' in data &&
    data.parsed &&
    typeof data.parsed === 'object' &&
    'info' in data.parsed &&
    data.parsed.info &&
    typeof data.parsed.info === 'object' &&
    'mint' in data.parsed.info &&
    'tokenAmount' in data.parsed.info
  );
}

// Helper function to safely get mint from parsed token account
export function getTokenAccountMint(accountData: any): string | null {
  if (isParsedTokenAccountData(accountData)) {
    return accountData.parsed.info.mint;
  }
  return null;
}

// Helper function to safely get token amount from parsed token account
export function getTokenAccountAmount(accountData: any): number | null {
  if (isParsedTokenAccountData(accountData)) {
    return accountData.parsed.info.tokenAmount.uiAmount;
  }
  return null;
}
