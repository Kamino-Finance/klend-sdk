import { MAIN_MARKET } from '../utils/constants';
import {
  getAddressArg,
  maybePrintHelp,
  parseArgs,
  requireAddressArg,
  resolveKeypairPath,
  resolveRpcUrl,
} from '../utils/cli';
import { loadSwapExampleContext, printObligationSummary } from '../utils/swap_examples';

const usage = `
Usage:
  yarn obligation-info -- --obligation <OBLIGATION> --keypair <KEYPAIR> [--rpc <RPC>] [--market <MARKET>]

Environment fallbacks:
  --rpc falls back to RPC, then RPC_ENDPOINT
  --keypair falls back to KEYPAIR_FILE
`;

(async () => {
  const args = parseArgs();
  maybePrintHelp(args, usage);

  const ctx = await loadSwapExampleContext({
    rpcUrl: resolveRpcUrl(args),
    keypairPath: resolveKeypairPath(args),
    obligationAddress: requireAddressArg(args, 'obligation'),
    marketAddress: getAddressArg(args, 'market') ?? MAIN_MARKET,
  });

  printObligationSummary(ctx.market, ctx.obligation);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
