'use strict';

require('@nomicfoundation/hardhat-ethers');

const { subtask } = require('hardhat/config');
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
} = require('hardhat/builtin-tasks/task-names');

const SOLC_VERSION = '0.8.28';

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }, _hre, runSuper) => {
    if (solcVersion !== SOLC_VERSION) return runSuper();
    const solc = require('solc');
    return {
      compilerPath: require.resolve('solc/soljson.js'),
      isSolcJs: true,
      version: SOLC_VERSION,
      longVersion: solc.version(),
    };
  },
);

subtask(TASK_COMPILE_SOLIDITY_RUN_SOLCJS).setAction(
  async ({ input, solcJsPath }) => {
    const solc = require('solc/wrapper')(require(solcJsPath));
    return JSON.parse(solc.compile(JSON.stringify(input)));
  },
);

module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      metadata: { bytecodeHash: 'ipfs' },
    },
  },
  paths: {
    sources: './contracts',
    tests: './contract-tests',
    cache: './cache',
    artifacts: './artifacts',
  },
};
