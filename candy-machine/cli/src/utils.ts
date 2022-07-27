/* eslint-disable @typescript-eslint/ban-ts-comment */
import * as anchor from '@project-serum/anchor';
import { getAccount, getMint } from '@solana/spl-token';
import { PROGRAM_ID } from '@withcomet/milky-way/src/generated';
import { program } from 'commander';
import fs from 'fs';
import log from 'loglevel';
import path from 'path';
import {
  CACHE_PATH,
  CLUSTERS,
  CONFIG_ARRAY_START_V2,
  CONFIG_LINE_SIZE_V2,
  DEFAULT_CLUSTER,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from './constants';

export function programCommand(name: string) {
  return program
    .command(name)
    .option(
      '-e, --env <string>',
      'Solana cluster env name',
      'devnet', //mainnet-beta, testnet, devnet
    )
    .option('-r, --rpc-url <string>', 'Solana cluster rpc-url')
    .requiredOption('-k, --keypair <path>', `Solana wallet location`)
    .option('-l, --log-level <string>', 'log level', setLogLevel)
    .option('-c, --cache-name <string>', 'Cache file name', 'temp');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setLogLevel(value, prev) {
  if (value === undefined || value === null) {
    return;
  }
  log.info('setting the log value to: ' + value);
  log.setLevel(value);
}

export function loadWalletKey(keypair): anchor.web3.Keypair {
  if (!keypair || keypair == '') {
    throw new Error('Keypair is required!');
  }
  const loaded = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString())),
  );
  log.info(`wallet public key: ${loaded.publicKey}`);
  return loaded;
}

export async function loadMilkyWayProgram(
  walletKeyPair: anchor.web3.Keypair,
  env: string,
  customRpcUrl?: string,
) {
  if (customRpcUrl) console.log('USING CUSTOM URL', customRpcUrl);

  const solConnection = new anchor.web3.Connection(customRpcUrl || getCluster(env));

  const walletWrapper = new anchor.Wallet(walletKeyPair);
  const provider = new anchor.AnchorProvider(solConnection, walletWrapper, {
    preflightCommitment: 'recent',
  });
  const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
  const program = new anchor.Program(idl, PROGRAM_ID, provider);
  log.debug('program id from anchor', program.programId.toBase58());
  return program;
}

export function getCluster(name: string): string {
  for (const cluster of CLUSTERS) {
    if (cluster.name === name) {
      return cluster.url;
    }
  }
  return DEFAULT_CLUSTER.url;
}

export async function getMilkyWayConfig(
  walletKeyPair: anchor.web3.Keypair,
  anchorProgram: anchor.Program,
  configPath: any,
): Promise<{
  number: number;
  symbol: string;
  sellerFeeBasisPoints: number;
  creators: {
    address: anchor.web3.PublicKey;
    verified: boolean;
    share: number;
  }[];
  retainAuthority: boolean;
  mutable: boolean;
  price: anchor.BN;
  treasuryWallet: anchor.web3.PublicKey;
  splToken: anchor.web3.PublicKey | null;
  gatekeeper: null | {
    expireOnUse: boolean;
    gatekeeperNetwork: anchor.web3.PublicKey;
  };
  endSettings: null | [number, anchor.BN];
  whitelistMintSettings: null | {
    mode: any;
    mint: anchor.web3.PublicKey;
    presale: boolean;
    discountPrice: null | anchor.BN;
  };
  hiddenSettings: null | {
    name: string;
    uri: string;
    hash: Uint8Array;
  };
  cometMintSettings: null | {
    name: string;
    uri: string;
    sequelMint: boolean;
  };
  goLiveDate: anchor.BN | null;
}> {
  if (configPath === undefined) {
    throw new Error('The configPath is undefined');
  }
  const configString = fs.readFileSync(configPath);

  const config = JSON.parse(configString.toString());

  const {
    number,
    symbol,
    sellerFeeBasisPoints,
    creators,
    noRetainAuthority,
    noMutable,
    price,
    splToken,
    splTokenAccount,
    solTreasuryAccount,
    gatekeeper,
    endSettings,
    hiddenSettings,
    whitelistMintSettings,
    cometMintSettings,
    goLiveDate,
  } = config;

  let wallet;
  let parsedPrice = price;
  const parsedCreators = creators.map((c) => ({
    address: new anchor.web3.PublicKey(c.address),
    verified: c.verified,
    share: c.share,
  }));

  const splTokenAccountFigured = splTokenAccount
    ? splTokenAccount
    : splToken
    ? (await getAtaForMint(new anchor.web3.PublicKey(splToken), walletKeyPair.publicKey))[0]
    : null;
  if (splToken) {
    if (solTreasuryAccount) {
      throw new Error(
        'If spl-token-account or spl-token is set then sol-treasury-account cannot be set',
      );
    }
    if (!splToken) {
      throw new Error('If spl-token-account is set, spl-token must also be set');
    }
    const splTokenKey = new anchor.web3.PublicKey(splToken);
    const splTokenAccountKey = new anchor.web3.PublicKey(splTokenAccountFigured);
    if (!splTokenAccountFigured) {
      throw new Error('If spl-token is set, spl-token-account must also be set');
    }

    const mintInfo = await getMint(anchorProgram.provider.connection, splTokenKey);
    if (!mintInfo.isInitialized) {
      throw new Error(`The specified spl-token is not initialized`);
    }
    const tokenAccount = await getAccount(anchorProgram.provider.connection, splTokenAccountKey);
    if (!tokenAccount.isInitialized) {
      throw new Error(`The specified spl-token-account is not initialized`);
    }
    if (!tokenAccount.mint.equals(splTokenKey)) {
      throw new Error(
        `The spl-token-account's mint (${tokenAccount.mint.toString()}) does not match specified spl-token ${splTokenKey.toString()}`,
      );
    }

    wallet = new anchor.web3.PublicKey(splTokenAccountKey);
    parsedPrice = price * 10 ** mintInfo.decimals;
    if (whitelistMintSettings?.discountPrice) {
      whitelistMintSettings.discountPrice *= 10 ** mintInfo.decimals;
    }
  } else {
    parsedPrice = price * 10 ** 9;
    if (whitelistMintSettings?.discountPrice) {
      whitelistMintSettings.discountPrice *= 10 ** 9;
    }
    wallet = solTreasuryAccount
      ? new anchor.web3.PublicKey(solTreasuryAccount)
      : walletKeyPair.publicKey;
  }

  if (whitelistMintSettings) {
    whitelistMintSettings.mint = new anchor.web3.PublicKey(whitelistMintSettings.mint);
    if (whitelistMintSettings?.discountPrice) {
      whitelistMintSettings.discountPrice = new anchor.BN(whitelistMintSettings.discountPrice);
    }
  }

  if (endSettings) {
    if (endSettings.endSettingType.date) {
      endSettings.number = new anchor.BN(parseDate(endSettings.value));
    } else if (endSettings.endSettingType.amount) {
      endSettings.number = new anchor.BN(endSettings.value);
    }
    delete endSettings.value;
  }

  if (hiddenSettings) {
    const utf8Encode = new TextEncoder();
    hiddenSettings.hash = utf8Encode.encode(hiddenSettings.hash);
  }

  if (gatekeeper) {
    gatekeeper.gatekeeperNetwork = new anchor.web3.PublicKey(gatekeeper.gatekeeperNetwork);
  }

  return {
    number,
    symbol,
    sellerFeeBasisPoints,
    creators: parsedCreators,
    retainAuthority: !noRetainAuthority,
    mutable: !noMutable,
    price: new anchor.BN(parsedPrice),
    treasuryWallet: wallet,
    splToken: splToken ? new anchor.web3.PublicKey(splToken) : null,
    gatekeeper,
    endSettings,
    hiddenSettings,
    whitelistMintSettings,
    cometMintSettings,
    goLiveDate: goLiveDate ? new anchor.BN(parseDate(goLiveDate)) : null,
  };
}

export const getAtaForMint = async (
  mint: anchor.web3.PublicKey,
  buyer: anchor.web3.PublicKey,
): Promise<[anchor.web3.PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [buyer.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  );
};

export function parseDate(date) {
  if (date === 'now') {
    return Date.now() / 1000;
  }
  return Date.parse(date) / 1000;
}

export function uuidFromConfigPubkey(configAccount: anchor.web3.PublicKey) {
  return configAccount.toBase58().slice(0, 6);
}

export async function createCandyMachineV2Account(
  anchorProgram,
  candyData: CandyMachineData,
  payerWallet,
  candyAccount,
) {
  const size =
    candyData.hiddenSettings ||
    (candyData.cometMintSettings && candyData.cometMintSettings.sequelMint)
      ? CONFIG_ARRAY_START_V2
      : CONFIG_ARRAY_START_V2 +
        4 +
        candyData.itemsAvailable.toNumber() * CONFIG_LINE_SIZE_V2 +
        8 +
        2 * (Math.floor(candyData.itemsAvailable.toNumber() / 8) + 1);

  return anchor.web3.SystemProgram.createAccount({
    fromPubkey: payerWallet,
    newAccountPubkey: candyAccount,
    space: size,
    lamports: await anchorProgram.provider.connection.getMinimumBalanceForRentExemption(size),
    programId: PROGRAM_ID,
  });
}

export enum WhitelistMintMode {
  BurnEveryTime,
  NeverBurn,
}

export interface CandyMachineData {
  itemsAvailable: anchor.BN;
  uuid: null | string;
  symbol: string;
  sellerFeeBasisPoints: number;
  isMutable: boolean;
  maxSupply: anchor.BN;
  price: anchor.BN;
  retainAuthority: boolean;
  gatekeeper: null | {
    expireOnUse: boolean;
    gatekeeperNetwork: anchor.web3.PublicKey;
  };
  goLiveDate: null | anchor.BN;
  endSettings: null | [number, anchor.BN];
  whitelistMintSettings: null | {
    mode: WhitelistMintMode;
    mint: anchor.web3.PublicKey;
    presale: boolean;
    discountPrice: null | anchor.BN;
  };
  hiddenSettings: null | {
    name: string;
    uri: string;
    hash: Uint8Array;
  };
  cometMintSettings: null | {
    name: string;
    uri: string;
    sequelMint: boolean;
  };
  creators: {
    address: anchor.web3.PublicKey;
    verified: boolean;
    share: number;
  }[];
}

export const getTokenWallet = async function (
  wallet: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
) {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    )
  )[0];
};

export const getMetadata = async (mint: anchor.web3.PublicKey): Promise<anchor.web3.PublicKey> => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID,
    )
  )[0];
};

export const getMasterEdition = async (
  mint: anchor.web3.PublicKey,
): Promise<anchor.web3.PublicKey> => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )
  )[0];
};

export const getCandyMachineCreator = async (
  candyMachine: anchor.web3.PublicKey,
): Promise<[anchor.web3.PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from('candy_machine'), candyMachine.toBuffer()],
    PROGRAM_ID,
  );
};

export function chunks(array, size) {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) =>
    array.slice(index * size, (index + 1) * size),
  );
}

export function cachePath(env: string, cacheName: string, cPath = CACHE_PATH, legacy = false) {
  const filename = `${env}-${cacheName}`;
  return path.join(cPath, legacy ? filename : `${filename}.json`);
}

export function loadCache(cacheName: string, env: string, cPath = CACHE_PATH, legacy = false) {
  const path = cachePath(env, cacheName, cPath, legacy);

  if (!fs.existsSync(path)) {
    if (!legacy) {
      return loadCache(cacheName, env, cPath, true);
    }
    return undefined;
  }

  return JSON.parse(fs.readFileSync(path).toString());
}

export function saveCache(
  cacheName: string,
  env: string,
  cacheContent,
  cPath: string = CACHE_PATH,
) {
  cacheContent.env = env;
  cacheContent.cacheName = cacheName;
  if (!fs.existsSync(cPath)) {
    fs.mkdirSync(cPath, { recursive: true });
  }
  fs.writeFileSync(cachePath(env, cacheName, cPath), JSON.stringify(cacheContent));
}
