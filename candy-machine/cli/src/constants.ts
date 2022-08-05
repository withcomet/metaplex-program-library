import * as anchor from '@project-serum/anchor';

export const MILKY_WAY_PROGRAM_ID = new anchor.web3.PublicKey(
  'mkwGBRGbNv8aWekyAx8Af5ebXaQr5UeJFZnxgUqcZ7B',
);
export const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);
export const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new anchor.web3.PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);
export const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);
export const MAX_NAME_LENGTH = 32;
export const MAX_URI_LENGTH = 200;
export const MAX_SYMBOL_LENGTH = 10;
export const MAX_CREATOR_LEN = 32 + 1 + 1;
export const MAX_CREATOR_LIMIT = 5;
export const CONFIG_ARRAY_START_V2 =
  8 + // key
  32 + // authority
  32 + //wallet
  33 + // token mint
  4 +
  6 + // uuid
  8 + // price
  8 + // items available
  9 + // go live
  10 + // end settings
  4 +
  MAX_SYMBOL_LENGTH + // u32 len + symbol
  2 + // seller fee basis points
  4 +
  MAX_CREATOR_LIMIT * MAX_CREATOR_LEN + // optional + u32 len + actual vec
  8 + //max supply
  1 + // is mutable
  1 + // retain authority
  1 + // option for hidden setting
  4 +
  MAX_NAME_LENGTH + // name length,
  4 +
  MAX_URI_LENGTH + // uri length,
  32 + // hash
  4 + // max number of lines;
  8 + // items redeemed
  1 + // whitelist option
  1 + // whitelist mint mode
  1 + // allow presale
  9 + // discount price
  32 + // mint key for whitelist
  1 +
  32 +
  1 +
  1 + // option for comet mint settings
  4 +
  MAX_NAME_LENGTH + // comet name length
  4 +
  MAX_URI_LENGTH; // gatekeeper
export const CONFIG_LINE_SIZE_V2 = 4 + 32 + 4 + 200;
export const CACHE_PATH = './.cache';

type Cluster = {
  name: string;
  url: string;
};

export const CLUSTERS: Cluster[] = [
  {
    name: 'mainnet-beta',
    url: 'https://api.metaplex.solana.com/',
  },
  {
    name: 'testnet',
    url: anchor.web3.clusterApiUrl('testnet'),
  },
  {
    name: 'devnet',
    url: anchor.web3.clusterApiUrl('devnet'),
  },
];
export const DEFAULT_CLUSTER = CLUSTERS[2];
