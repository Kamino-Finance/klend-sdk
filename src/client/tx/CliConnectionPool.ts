import {
  createSolanaRpcSubscriptions,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
} from '@solana/kit';
import { Connection } from '@solana/web3.js';
import { Chain, createCliRpc } from './rpc';

export class CliConnectionPool {
  private readonly _rpc: Rpc<SolanaRpcApi>;

  private readonly _wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>;

  private readonly _chain: Chain;

  private readonly _legacyConnection: Connection;

  private readonly _spam: boolean;

  constructor(chain: Chain) {
    this._chain = chain;

    this._rpc = createCliRpc(chain);

    this._wsRpc = createSolanaRpcSubscriptions(this.chain.wsEndpoint.url);

    this._legacyConnection = new Connection(this.chain.endpoint.url, {
      commitment: 'processed',
    });

    this._spam = chain.name !== 'localnet';
  }

  get chain(): Chain {
    return this._chain;
  }

  get rpc(): Rpc<SolanaRpcApi> {
    return this._rpc;
  }

  get wsRpc(): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
    return this._wsRpc;
  }

  get legacyConnection(): Connection {
    return this._legacyConnection;
  }

  get shouldSpam(): boolean {
    return this._spam;
  }
}
