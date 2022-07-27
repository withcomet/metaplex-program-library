import * as anchor from '@project-serum/anchor';
import {
  createApproveInstruction,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createRevokeInstruction,
  MintLayout,
} from '@solana/spl-token';
import { program } from 'commander';
import log from 'loglevel';
import { TOKEN_METADATA_PROGRAM_ID, TOKEN_PROGRAM_ID } from './constants';
import {
  chunks,
  createCandyMachineV2Account,
  getAtaForMint,
  getCandyMachineCreator,
  getMasterEdition,
  getMetadata,
  getMilkyWayConfig,
  getTokenWallet,
  loadCache,
  loadMilkyWayProgram,
  loadWalletKey,
  programCommand,
  saveCache,
  uuidFromConfigPubkey,
} from './utils';

program.version('0.1.0');
log.setLevel(log.levels.INFO);

programCommand('create_candy_machine')
  .requiredOption('-cp, --config-path <string>', 'JSON file with candy machine settings')
  .option('-r, --rpc-url <string>', 'custom rpc url since this is a heavy command')
  .action(async (_, cmd) => {
    const { keypair, env, cacheName, configPath, rpcUrl } = cmd.opts();

    const walletKeypair = loadWalletKey(keypair);
    const milkyWayProgram = await loadMilkyWayProgram(walletKeypair, env, rpcUrl);

    let uploadSuccessful = true;
    const savedContent = loadCache(cacheName, env);
    const cacheContent = savedContent || {};

    if (!cacheContent.program) {
      cacheContent.program = {};
    }

    if (!cacheContent.items) {
      cacheContent.items = {};
    }

    let candyMachine = cacheContent.program.candyMachine
      ? new anchor.web3.PublicKey(cacheContent.program.candyMachine)
      : undefined;

    const startMs = Date.now();
    log.info('started at: ' + startMs.toString());

    const {
      number,
      symbol,
      sellerFeeBasisPoints,
      creators,
      retainAuthority,
      mutable,
      price,
      splToken,
      treasuryWallet,
      gatekeeper,
      endSettings,
      hiddenSettings,
      whitelistMintSettings,
      cometMintSettings,
      goLiveDate,
    } = await getMilkyWayConfig(walletKeypair, milkyWayProgram, configPath);

    const keys = Array.from(Array(number).keys());

    if (!cacheContent.program.uuid) {
      const candyAccount = anchor.web3.Keypair.generate();
      const uuid = uuidFromConfigPubkey(candyAccount.publicKey);

      const candyData = {
        itemsAvailable: new anchor.BN(number),
        uuid,
        symbol,
        sellerFeeBasisPoints,
        isMutable: mutable,
        maxSupply: new anchor.BN(0),
        retainAuthority,
        gatekeeper,
        goLiveDate,
        price,
        endSettings,
        whitelistMintSettings,
        hiddenSettings,
        cometMintSettings,
        creators,
      };

      try {
        const remainingAccounts = [];

        if (splToken) {
          remainingAccounts.push({
            pubkey: splToken,
            isSigner: false,
            isWritable: false,
          });
        }

        const txId = await milkyWayProgram.rpc.initializeCandyMachine(candyData, {
          accounts: {
            candyMachine: candyAccount.publicKey,
            wallet: treasuryWallet,
            authority: walletKeypair.publicKey,
            payer: walletKeypair.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          signers: [walletKeypair, candyAccount],
          remainingAccounts: remainingAccounts.length > 0 ? remainingAccounts : undefined,
          instructions: [
            await createCandyMachineV2Account(
              milkyWayProgram,
              candyData,
              walletKeypair.publicKey,
              candyAccount.publicKey,
            ),
          ],
        });

        cacheContent.program.uuid = uuid;
        cacheContent.program.candyMachine = candyAccount.publicKey.toBase58();
        candyMachine = candyAccount.publicKey;

        if (candyData.cometMintSettings) {
          keys.map((k) => {
            cacheContent.items[k] = {
              name: candyData.cometMintSettings.name + ' #' + (k + 1).toString(),
              uri: candyData.cometMintSettings.uri + (k + 1).toString(),
              onChain: candyData.cometMintSettings.sequelMint,
            };
          });
        }

        log.info(`txId: ${txId}`);
        log.info(
          `initialized config for a candy machine with publickey: ${candyMachine.toBase58()}`,
        );

        saveCache(cacheName, env, cacheContent);
      } catch (e) {
        log.error('Error deploying config to Solana network.', e);
        throw e;
      }
    } else {
      log.info(
        `config for a candy machine with publickey: ${cacheContent.program.candyMachine} has been already initialized`,
      );
    }

    if (cometMintSettings && !cometMintSettings.sequelMint) {
      try {
        await Promise.all(
          chunks(Array.from(Array(keys.length).keys()), 1000).map(async (allIndexesInSlice) => {
            const offsets = [];
            for (let offset = 0; offset < allIndexesInSlice.length; offset += 10) {
              offsets.push(offset);
            }
            await Promise.all(
              offsets.map(async (offset) => {
                const indexes = allIndexesInSlice.slice(offset, offset + 10);
                const onChain = indexes.filter((i) => {
                  const index = keys[i];
                  return cacheContent.items[index]?.onChain || false;
                });
                const ind = keys[indexes[0]];

                if (onChain.length != indexes.length) {
                  log.info(`Writing indices ${ind}-${keys[indexes[indexes.length - 1]]}`);

                  try {
                    await milkyWayProgram.rpc.addConfigLines(
                      ind,
                      indexes.map((i) => ({
                        name: cacheContent.items[keys[i]].name,
                        uri: cacheContent.items[keys[i]].uri,
                      })),
                      {
                        accounts: {
                          candyMachine,
                          authority: walletKeypair.publicKey,
                        },
                        signers: [walletKeypair],
                      },
                    );
                    indexes.forEach((i) => {
                      cacheContent.items[keys[i]] = {
                        ...cacheContent.items[keys[i]],
                        onChain: true,
                        verifyRun: false,
                      };
                    });
                    saveCache(cacheName, env, cacheContent);
                  } catch (e) {
                    log.error(
                      `saving config line ${ind}-${keys[indexes[indexes.length - 1]]} failed`,
                      e,
                    );
                    uploadSuccessful = false;
                  }
                }
              }),
            );
          }),
        );
      } catch (e) {
        log.error(e);
      } finally {
        saveCache(cacheName, env, cacheContent);
      }
    } else {
      if (hiddenSettings) {
        log.info('Skipping upload to chain as this is a hidden Candy Machine');
      } else {
        log.info('Skipping upload to chain as this is a sequel-mint Candy Machine');
      }
    }

    console.log(`Done. Successful = ${uploadSuccessful}.`);

    const endMs = Date.now();
    const timeTaken = new Date(endMs - startMs).toISOString().substr(11, 8);

    log.info(`ended at: ${new Date(endMs).toISOString()}. time taken: ${timeTaken}`);

    process.exit(0);
  });

programCommand('mint_token')
  .requiredOption('-cmid, --candymachine-id <string>', 'Public key of candy machine')
  .option('-r, --rpc-url <string>', 'custom rpc url since this is a heavy command')
  .action(async (_, cmd) => {
    const { keypair, env, rpcUrl, candymachineId } = cmd.opts();

    const mint = anchor.web3.Keypair.generate();

    const walletKeypair = loadWalletKey(keypair);
    const milkyWayProgram = await loadMilkyWayProgram(walletKeypair, env, rpcUrl);

    const userTokenAccountAddress = await getTokenWallet(walletKeypair.publicKey, mint.publicKey);

    const candyMachineAddress = new anchor.web3.PublicKey(candymachineId);
    const candyMachine: any = await milkyWayProgram.account.candyMachine.fetch(candyMachineAddress);
    const remainingAccounts = [];
    const signers = [mint, walletKeypair];
    const cleanupInstructions = [];
    const instructions = [
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: walletKeypair.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MintLayout.span,
        lamports: await milkyWayProgram.provider.connection.getMinimumBalanceForRentExemption(
          MintLayout.span,
        ),
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mint.publicKey,
        0,
        walletKeypair.publicKey,
        walletKeypair.publicKey,
      ),
      createAssociatedTokenAccountInstruction(
        walletKeypair.publicKey,
        userTokenAccountAddress,
        walletKeypair.publicKey,
        mint.publicKey,
      ),
      createMintToInstruction(
        mint.publicKey,
        userTokenAccountAddress,
        walletKeypair.publicKey,
        1,
        [],
      ),
    ];

    if (candyMachine.data.whitelistMintSettings) {
      const mint = new anchor.web3.PublicKey(candyMachine.data.whitelistMintSettings.mint);

      const whitelistToken = (await getAtaForMint(mint, walletKeypair.publicKey))[0];
      remainingAccounts.push({
        pubkey: whitelistToken,
        isWritable: true,
        isSigner: false,
      });

      if (candyMachine.data.whitelistMintSettings.mode.burnEveryTime) {
        const whitelistBurnAuthority = anchor.web3.Keypair.generate();

        remainingAccounts.push({
          pubkey: mint,
          isWritable: true,
          isSigner: false,
        });
        remainingAccounts.push({
          pubkey: whitelistBurnAuthority.publicKey,
          isWritable: false,
          isSigner: true,
        });
        signers.push(whitelistBurnAuthority);
        const exists = await milkyWayProgram.provider.connection.getAccountInfo(whitelistToken);
        if (exists) {
          instructions.push(
            createApproveInstruction(
              whitelistToken,
              whitelistBurnAuthority.publicKey,
              walletKeypair.publicKey,
              1,
              [],
            ),
          );
          cleanupInstructions.push(
            createRevokeInstruction(whitelistToken, walletKeypair.publicKey, []),
          );
        }
      }
    }

    let tokenAccount;
    if (candyMachine.tokenMint) {
      const transferAuthority = anchor.web3.Keypair.generate();

      tokenAccount = await getTokenWallet(walletKeypair.publicKey, candyMachine.tokenMint);

      remainingAccounts.push({
        pubkey: tokenAccount,
        isWritable: true,
        isSigner: false,
      });
      remainingAccounts.push({
        pubkey: transferAuthority.publicKey,
        isWritable: false,
        isSigner: true,
      });

      instructions.push(
        createApproveInstruction(
          tokenAccount,
          transferAuthority.publicKey,
          walletKeypair.publicKey,
          candyMachine.data.price.toNumber(),
          [],
        ),
      );
      signers.push(transferAuthority);
      cleanupInstructions.push(createRevokeInstruction(tokenAccount, walletKeypair.publicKey, []));
    }
    const metadataAddress = await getMetadata(mint.publicKey);
    const masterEdition = await getMasterEdition(mint.publicKey);

    const [candyMachineCreator, creatorBump] = await getCandyMachineCreator(candyMachineAddress);

    const txId = await milkyWayProgram.rpc.mintNft(creatorBump, {
      accounts: {
        candyMachine: candyMachineAddress,
        candyMachineCreator,
        payer: walletKeypair.publicKey,
        wallet: candyMachine.wallet,
        mint: mint.publicKey,
        metadata: metadataAddress,
        masterEdition,
        mintAuthority: walletKeypair.publicKey,
        updateAuthority: walletKeypair.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        recentBlockhashes: anchor.web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
        instructionSysvarAccount: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      },
      signers,
      remainingAccounts: remainingAccounts.length > 0 ? remainingAccounts : undefined,
      instructions: [...instructions, ...cleanupInstructions],
    });

    console.log(`txId: ${txId}`);
    console.log(`mint address: ${mint.publicKey.toBase58()}`);
  });

program.parse(process.argv);
