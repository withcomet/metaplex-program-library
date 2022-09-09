/**
 * This code was GENERATED using the solita package.
 * Please DO NOT EDIT THIS FILE, instead rerun solita to update it or write a wrapper to add functionality.
 *
 * See: https://github.com/metaplex-foundation/solita
 */

import * as beet from '@metaplex-foundation/beet';
import * as web3 from '@solana/web3.js';

/**
 * @category Instructions
 * @category SetCollectionDuringMint
 * @category generated
 */
export const setCollectionDuringMintStruct = new beet.BeetArgsStruct<{
  instructionDiscriminator: number[] /* size: 8 */;
}>(
  [['instructionDiscriminator', beet.uniformFixedSizeArray(beet.u8, 8)]],
  'SetCollectionDuringMintInstructionArgs',
);
/**
 * Accounts required by the _setCollectionDuringMint_ instruction
 *
 * @property [] candyMachine
 * @property [] metadata
 * @property [**signer**] payer
 * @property [_writable_] collectionPda
 * @property [] tokenMetadataProgram
 * @property [] instructions
 * @property [] collectionMint
 * @property [_writable_] collectionMetadata
 * @property [] collectionMasterEdition
 * @property [] authority
 * @property [] collectionAuthorityRecord
 * @category Instructions
 * @category SetCollectionDuringMint
 * @category generated
 */
export type SetCollectionDuringMintInstructionAccounts = {
  candyMachine: web3.PublicKey;
  metadata: web3.PublicKey;
  payer: web3.PublicKey;
  collectionPda: web3.PublicKey;
  tokenMetadataProgram: web3.PublicKey;
  instructions: web3.PublicKey;
  collectionMint: web3.PublicKey;
  collectionMetadata: web3.PublicKey;
  collectionMasterEdition: web3.PublicKey;
  authority: web3.PublicKey;
  collectionAuthorityRecord: web3.PublicKey;
};

export const setCollectionDuringMintInstructionDiscriminator = [103, 17, 200, 25, 118, 95, 125, 61];

/**
 * Creates a _SetCollectionDuringMint_ instruction.
 *
 * @param accounts that will be accessed while the instruction is processed
 * @category Instructions
 * @category SetCollectionDuringMint
 * @category generated
 */
export function createSetCollectionDuringMintInstruction(
  accounts: SetCollectionDuringMintInstructionAccounts,
  programId = new web3.PublicKey('mkwGBRGbNv8aWekyAx8Af5ebXaQr5UeJFZnxgUqcZ7B'),
) {
  const [data] = setCollectionDuringMintStruct.serialize({
    instructionDiscriminator: setCollectionDuringMintInstructionDiscriminator,
  });
  const keys: web3.AccountMeta[] = [
    {
      pubkey: accounts.candyMachine,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.metadata,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.payer,
      isWritable: false,
      isSigner: true,
    },
    {
      pubkey: accounts.collectionPda,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: accounts.tokenMetadataProgram,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.instructions,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.collectionMint,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.collectionMetadata,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: accounts.collectionMasterEdition,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.authority,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.collectionAuthorityRecord,
      isWritable: false,
      isSigner: false,
    },
  ];

  const ix = new web3.TransactionInstruction({
    programId,
    keys,
    data,
  });
  return ix;
}
