'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const solc = require('solc');
const ROOT = path.resolve(__dirname, '..');

function compileContracts() {
  if (!solc.version().startsWith('0.8.28+')) throw new Error('Use the pinned Solidity 0.8.28 compiler.');
  const sources = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith('.sol')) sources[path.relative(ROOT, file).replaceAll('\\', '/')] = {
        // Preserve the exact source convention of the verified deployment.
        content: fs.readFileSync(file, 'utf8').replace(/\r\n|\r|\n/g, '\r\n'),
      };
    }
  }
  visit(path.join(ROOT, 'contracts'));
  const input = {
    language: 'Solidity', sources,
    settings: {
      optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', metadata: { bytecodeHash: 'ipfs' },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers', 'metadata'], '': ['ast'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join('\n'));
  const id = crypto.createHash('sha256').update(solc.version() + JSON.stringify(input)).digest('hex');
  const buildFile = path.join(ROOT, 'artifacts', 'build-info', id + '.json');
  fs.mkdirSync(path.dirname(buildFile), { recursive: true });
  fs.writeFileSync(buildFile, JSON.stringify({ id, _format: 'hh-sol-build-info-1', solcVersion: '0.8.28', solcLongVersion: solc.version(), input, output }));
  for (const [sourceName, contracts] of Object.entries(output.contracts)) {
    for (const [contractName, contract] of Object.entries(contracts)) {
      const directory = path.join(ROOT, 'artifacts', sourceName);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, contractName + '.json'), JSON.stringify({
        _format: 'hh-sol-artifact-1', contractName, sourceName, abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object,
        deployedBytecode: '0x' + contract.evm.deployedBytecode.object,
        linkReferences: contract.evm.bytecode.linkReferences,
        deployedLinkReferences: contract.evm.deployedBytecode.linkReferences,
      }, null, 2));
      fs.writeFileSync(path.join(directory, contractName + '.dbg.json'), JSON.stringify({
        _format: 'hh-sol-dbg-1', buildInfo: path.relative(directory, buildFile).replaceAll('\\', '/'),
      }, null, 2));
    }
  }
  console.log('Compiled contracts with pinned Solidity ' + solc.version() + ' (CRLF, optimizer 200, Paris).');
  return output;
}

module.exports = { compileContracts };
if (require.main === module) compileContracts();
