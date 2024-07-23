import { PublicKey } from '@solana/web3.js';
import { OracleType, OracleTypeKind } from '@hubbleprotocol/scope-sdk';

const PRICE_MAPPING: Record<Price, PriceFeed> = {
  SOL_USD_1: {
    type: new OracleType.Pyth(),
    price: new PublicKey('1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM'),
  },
  SOL_USD_2: {
    type: new OracleType.Pyth(),
    price: new PublicKey('1111111ogCyDbaRMvkdsHB3qfdyFYaG1WtRUAfdh'),
  },
  SOL_USD_3: {
    type: new OracleType.Pyth(),
    price: new PublicKey('11111112D1oxKts8YPdTJRG5FzxTNpMtWmq8hkVx3'),
  },
  SOL_USD_4: {
    type: new OracleType.Pyth(),
    price: new PublicKey('11111112cMQwSC9qirWGjZM6gLGwW69X22mqwLLGP'),
  },
  SOL_USD_5: {
    type: new OracleType.Pyth(),
    price: new PublicKey('111111131h1vYVSYuKP6AhS86fbRdMw9XHiZAvAaj'),
  },
  SOL_USD_6: {
    type: new OracleType.Pyth(),
    price: new PublicKey('11111113R2cuenjG5nFubqX9Wzuukdin2YfGQVzu5'),
  },
  SOL_USD_7: {
    type: new OracleType.Pyth(),
    price: new PublicKey('11111113pNDtm61yGF8j2ycAwLEPsuWQXobye5qDR'),
  },
  SOL_USD_8: {
    type: new OracleType.Pyth(),
    price: new PublicKey('11111114DhpssPJgSi1YU7hCMfYt1BJ334YgsffXm'),
  },
  SOL_USD_9: {
    type: new OracleType.Pyth(),
    price: new PublicKey('11111114d3RrygbPdAtMuFnDmzsN8T5fYKVQ7FVr7'),
  },
  SOL_USD_10: {
    type: new OracleType.Pyth(),
    price: new PublicKey('111111152P2r5yt6odmBLPsFCLBrFisJ3aS7LqLAT'),
  },
  SOL_USD_20: {
    type: new OracleType.Pyth(),
    price: new PublicKey('5EFzYTGXnK2h6XJFZ4Mwc9sp7unoGsLLmYszZ3tmyMbi'),
  },
  SOL_USD_25: {
    type: new OracleType.Pyth(),
    price: new PublicKey('3bz4kRRxBuxaTnNPAPrWTYgo5LiTh436wKnW6FhGhU6o'),
  },
  SOL_USD_30: {
    type: new OracleType.Pyth(),
    price: new PublicKey('3rvg4Y4FBixFGSdfsjjopaNDWMBAUiSgrnursnned17m'),
  },
  STSOL_USD_10: {
    type: new OracleType.Pyth(),
    price: new PublicKey('E1nAW1ZNVu5L2WuUk3jMMbjWjAyvgTfgPDVa9JRw2DHk'),
  },
  STSOL_USD_15: {
    type: new OracleType.Pyth(),
    price: new PublicKey('GK7K44YtZ5XccrNZJ2p2Jm3BWbWoX5YVsoPoTADfMY6V'),
  },
  STSOL_USD_20: {
    type: new OracleType.Pyth(),
    price: new PublicKey('111111193m4hAxmCcGXMfnjVPfNhWSjb69sDgffKu'),
  },
  STSOL_USD_25: {
    type: new OracleType.Pyth(),
    price: new PublicKey('3iwSN33wDGRcqJ89XqYNSt1WKusLPwgK7kMsj1zMBWHF'),
  },
  STSOL_USD_30: {
    type: new OracleType.Pyth(),
    price: new PublicKey('2ooNgGUyeidqruskeFBFsCPrex3GAgBtD62TYzooz6tb'),
  },
  USDC_USD_1: {
    type: new OracleType.Pyth(),
    price: new PublicKey('EFzHrtRNoeLiAwd6rRWfeMuEup19UC9UB4rcky8kXsgV'),
  },
  KSOL_STSOL_USD_614: {
    type: new OracleType.SwitchboardV2(),
    price: new PublicKey('2bpwkRWDEXHWYNBDddKssz6te82zCqwLR8qhR2acUtep'),
  },
  KUSDH_USDC_USD_1: {
    type: new OracleType.SwitchboardV2(),
    price: new PublicKey('GeKKsopLtKy6dUWfJTHJSSjFTuMagFmKyuq2FHUWDkhU'),
  },
};

export enum Price {
  SOL_USD_1 = 'SOL_USD_1',
  SOL_USD_2 = 'SOL_USD_2',
  SOL_USD_3 = 'SOL_USD_3',
  SOL_USD_4 = 'SOL_USD_4',
  SOL_USD_5 = 'SOL_USD_5',
  SOL_USD_6 = 'SOL_USD_6',
  SOL_USD_7 = 'SOL_USD_7',
  SOL_USD_8 = 'SOL_USD_8',
  SOL_USD_9 = 'SOL_USD_9',
  SOL_USD_10 = 'SOL_USD_10',
  SOL_USD_20 = 'SOL_USD_20',
  SOL_USD_25 = 'SOL_USD_25',
  SOL_USD_30 = 'SOL_USD_30',
  STSOL_USD_10 = 'STSOL_USD_10',
  STSOL_USD_15 = 'STSOL_USD_15',
  STSOL_USD_20 = 'STSOL_USD_20',
  STSOL_USD_25 = 'STSOL_USD_25',
  STSOL_USD_30 = 'STSOL_USD_30',
  USDC_USD_1 = 'USDC_USD_1',
  KSOL_STSOL_USD_614 = 'KSOL_STSOL_USD_614',
  KUSDH_USDC_USD_1 = 'KUSDH_USDC_USD_1',
}

export function getPriceAcc(price: Price): PriceFeed {
  const feed = PRICE_MAPPING[price];
  if (!feed) {
    throw new Error(`Price feed not found for ${price}`);
  }
  console.log('Price feed', JSON.stringify(feed), 'price', price);
  return feed;
}

export type PriceFeed = {
  type: OracleTypeKind;
  price: PublicKey;
  chain?: number[];
  twapChain?: number[];
};
