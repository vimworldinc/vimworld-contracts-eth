import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
    const accounts = await hre.ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.19",
        settings: {
            evmVersion: "london",
            optimizer: {
                runs: 200,
                enabled: true,
            },
            outputSelection: {
                "*": {
                    "*": ["storageLayout"],
                },
            },
        },
    },
    networks: {
        localhost: {
            url: "http://127.0.0.1:8545",
        },
        ethereum_mainnet: {
            url: process.env.MAINNET_RPC_URL || "",
            accounts:
                process.env.PRIVATE_KEY !== undefined
                    ? [process.env.PRIVATE_KEY]
                    : [],
            allowUnlimitedContractSize: true,
        },
        ethereum_sepolia_testnet: {
            url: process.env.SEPOLIA_RPC_URL || "",
            accounts:
                process.env.TEST_PRIVATE_KEY !== undefined
                    ? [process.env.TEST_PRIVATE_KEY]
                    : [],
            allowUnlimitedContractSize: true,
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
    mocha: {
        timeout: 3600000,
    },
};

export default config;
