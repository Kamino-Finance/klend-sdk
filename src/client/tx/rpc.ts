import {
  createDefaultRpcTransport,
  createRpc,
  createSolanaRpcApi,
  DEFAULT_RPC_CONFIG,
  Rpc,
  RpcTransport,
  SendTransactionApi,
  SolanaRpcApi,
  SolanaRpcApiDevnet,
  SolanaRpcApiMainnet,
  SolanaRpcApiTestnet,
} from '@solana/kit';
import { createHttpTransport } from '@solana/rpc-transport-http';
import { Mutable } from '../utils/modifiers';
import { Cluster } from './CliEnv';

export type RpcMethodTypes = SolanaRpcApi | SolanaRpcApiDevnet | SolanaRpcApiMainnet | SolanaRpcApiTestnet;

/**
 * Names of Solana RPC methods that should be multicasted to all configured multicast RPCs.
 */
const MULTICASTED_METHOD_NAMES: string[] = ['sendTransaction' as const satisfies keyof SendTransactionApi];

type RpcHeadersConfigParam = Parameters<typeof createHttpTransport>[0]['headers'];
export type AllowedHttpHeaders = Mutable<RpcHeadersConfigParam>;

export type RpcUrl = {
  url: string;
  name: string;
  headers?: AllowedHttpHeaders;
};

export type Chain = {
  name: Cluster;
  endpoint: RpcUrl;
  wsEndpoint: RpcUrl;
  multicastEndpoints: RpcUrl[];
};

export function createCliRpc<TExtraMethods>(rpcChain: Chain): Rpc<RpcMethodTypes & TExtraMethods> {
  return asRpc(createResilientRpcCaller(rpcChain));
}

function createUrlRpcCaller({ url, name, headers }: RpcUrl): RpcCaller {
  return new LabelledRpcCaller(createDefaultRpcTransport({ url, headers }), name);
}

function createResilientRpcCaller(rpcChain: Chain): RpcCaller {
  let resilientRpcCaller: RpcCaller = createUrlRpcCaller(rpcChain.endpoint);
  if (rpcChain.multicastEndpoints.length > 0) {
    resilientRpcCaller = new MethodRoutingRpcTransport(
      resilientRpcCaller,
      MULTICASTED_METHOD_NAMES,
      new MulticastingRpcTransport(
        rpcChain.multicastEndpoints.map((url) => createUrlRpcCaller(url)),
        resilientRpcCaller
      )
    );
  }
  return resilientRpcCaller;
}

function asRpc<TExtraMethods>(rpcCaller: RpcCaller): Rpc<RpcMethodTypes & TExtraMethods> {
  const api = createSolanaRpcApi<RpcMethodTypes & TExtraMethods>({
    ...DEFAULT_RPC_CONFIG,
    defaultCommitment: 'processed',
  });
  const transport = asRpcTransport(rpcCaller);
  return createRpc({ api, transport });
}

function asRpcTransport(rpcCaller: RpcCaller): RpcTransport {
  // Despite `ReturnType<RpcTransport>` working fine in all other contexts, it loses its type-inferring powers when
  // `RpcCaller.call()` is referenced directly (due to not seeing the actual type parameter), forcing this ugly cast:
  return rpcCaller.call.bind(rpcCaller) as RpcTransport;
}

/**
 * A "true" interface wrapping the function interface {@link RpcTransport} (so that a class can implement it).
 */
export interface RpcCaller {
  /**
   * See {@link RpcTransport}.
   */
  call(...args: Parameters<RpcTransport>): ReturnType<RpcTransport>;
}

class LabelledRpcCaller implements RpcCaller {
  private readonly transport: RpcTransport;
  private readonly label: string;

  constructor(transport: RpcTransport, label: string) {
    this.transport = transport;
    this.label = label;
  }

  call(...args: Parameters<RpcTransport>): ReturnType<RpcTransport> {
    return this.transport(...args);
  }

  toString(): string {
    return this.label;
  }
}

class MethodRoutingRpcTransport implements RpcCaller {
  private readonly defaultRpcCaller: RpcCaller;
  private readonly routedMethodNames: Set<string>;
  private readonly routedRpcCaller: RpcCaller;

  constructor(defaultRpcCaller: RpcCaller, routedMethodNames: Iterable<string>, routedRpcCaller: RpcCaller) {
    this.defaultRpcCaller = defaultRpcCaller;
    this.routedMethodNames = new Set(routedMethodNames);
    this.routedRpcCaller = routedRpcCaller;
  }

  call(...args: Parameters<RpcTransport>): ReturnType<RpcTransport> {
    const methodName = MethodRoutingRpcTransport.resolveMethodName(...args);
    if (this.routedMethodNames.has(methodName)) {
      return this.routedRpcCaller.call(...args);
    }
    return this.defaultRpcCaller.call(...args);
  }

  private static resolveMethodName(...args: Parameters<RpcTransport>): string {
    // Please excuse the ugly introspection, needed only because of the RpcTransport using a private type:
    return (args[0].payload as { method: string }).method;
  }
}

class MulticastingRpcTransport {
  private readonly multicastRpcCallers: Set<RpcCaller>;
  private readonly finalRpcCaller: RpcCaller;

  constructor(multicastRpcCallers: Iterable<RpcCaller>, finalRpcCaller: RpcCaller) {
    this.multicastRpcCallers = new Set(multicastRpcCallers);
    this.finalRpcCaller = finalRpcCaller;
  }

  call(...args: Parameters<RpcTransport>): ReturnType<RpcTransport> {
    for (const multicastRpcCaller of this.multicastRpcCallers) {
      // Please note the lack of `await` below. This is intended, since we want to fire and forget to all multicast
      // RPCs. This works in JavaScript (in contrast to e.g. Rust), because `Promise`s here start work when constructed,
      // not when "polled".
      multicastRpcCaller
        .call(...args)
        .catch((e) => console.log(`Calling multicast RPC ${multicastRpcCaller} failed; ignoring it`, e));
    }
    return this.finalRpcCaller.call(...args);
  }
}
