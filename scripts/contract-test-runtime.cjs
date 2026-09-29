'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ethers = require('ethers');
const ROOT = path.resolve(__dirname, '..');
let connection;
let provider;

async function initialize() {
  const { createHardhatRuntimeEnvironment } = await import('hardhat/hre');
  const hre = await createHardhatRuntimeEnvironment({
    networks: { hardhat: { type: 'edr-simulated', chainType: 'l1', hardfork: 'shanghai' } },
  }, {}, ROOT);
  connection = await hre.network.create('hardhat');
  provider = new ethers.BrowserProvider(connection.provider, undefined, { cacheTimeout: -1 });
  module.exports.ethers = {
    ...ethers, provider,
    getSigners: () => provider.listAccounts(),
    async deployContract(name, args = []) {
      const sources = ['contracts/' + name + '.sol', 'contracts/test/' + name + '.sol'];
      const artifactFile = sources.map(source => path.join(ROOT, 'artifacts', source, name + '.json')).find(file => fs.existsSync(file));
      if (!artifactFile) throw new Error('Compile the test contract first: ' + name);
      const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf8'));
      return new ethers.ContractFactory(artifact.abi, artifact.bytecode, await provider.getSigner()).deploy(...args);
    },
  };
}

async function close() {
  provider?.destroy();
  await connection?.close();
}
module.exports = { initialize, close };
