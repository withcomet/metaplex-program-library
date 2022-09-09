// @ts-check
const path = require('path');
const programDir = path.join(__dirname, '..', 'program');
const idlDir = path.join(__dirname, 'idl');
const sdkDir = path.join(__dirname, 'src', 'generated');
const binaryInstallDir = path.join(__dirname, '.crates');

const idlHook = (idl) => {
    const setCollectionDuringMintIx = idl.instructions.find(ix => ix.name === 'setCollectionDuringMint');
    const collectionMetadataAcc = setCollectionDuringMintIx.accounts.find(acc => acc.name === 'collectionMetadata');
    collectionMetadataAcc.isMut = true;
    return idl;
}

module.exports = {
  idlGenerator: 'anchor',
  programName: 'milky_way',
  programId: 'mkwGBRGbNv8aWekyAx8Af5ebXaQr5UeJFZnxgUqcZ7B',
  idlDir,
  idlHook,
  sdkDir,
  binaryInstallDir,
  programDir,
};
