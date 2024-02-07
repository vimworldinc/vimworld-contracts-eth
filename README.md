# VIMworld Solidity Project
# Specifications
### Project Overview

### Functional, Technical Requirements
Functional and Technical Requirements can be found in the [Requirements.pdf](./docs/Requirements.pdf) document

# Getting Started
Recommended Node version is 18.0.0 and above.

### Available commands

```bash
# install dependencies
$ npm install

# run tests
$ npm run test

# compute tests coverage
$ npm run coverage

# run hardhat solhint
$ npm run check-solhint

# run pretty on .ts , .sol files
$ npm run format
```

# Project Structure
This a template hardhat typescript project composed of contracts, tests, and deploy instructions that provides a great starting point for developers to quickly get up and running and deploying smart contracts on the Ethereum blockchain.

## Tests

Tests are found in the `./test/` folder. No additional keys are required to run the tests.

Both positive and negative cases are covered, and test coverage is 100%.

## Contracts

Solidity smart contracts are found in `./contracts/`

`./contracts/mocks` folder contains contracts mocks that are used for testing purposes.

## Deploy
Deploy script can be found in the `./scripts/deploy.ts`.

Rename `./.env.example` to `./.env` in the project root.
To add the private key of a deployer account, assign the following variables
```
PRIVATE_KEY=...
MAINNET_RPC_URL=...
TEST_PRIVATE_KEY=...
SEPOLIA_RPC_URL=...
```
example:
```bash
$ npm run deploy -- ethereum_mainnet
```
