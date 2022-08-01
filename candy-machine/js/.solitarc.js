// @ts-check
const path = require('path');
const programDir = path.join(__dirname, '..', 'program');
const idlDir = path.join(__dirname, 'idl');
const sdkDir = path.join(__dirname, 'src', 'generated');
const binaryInstallDir = path.join(__dirname, '.crates');

module.exports = {
  idlGenerator: 'anchor',
  programName: 'milky_way',
  programId: 'mkwGBRGbNv8aWekyAx8Af5ebXaQr5UeJFZnxgUqcZ7B',
  idlDir,
  sdkDir,
  binaryInstallDir,
  programDir,
};
