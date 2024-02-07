import { artifacts, ethers, network } from "hardhat";
import fs from "fs";
import { Contract } from "ethers";

export const runEnvironment = () => {
    return network.name
        .replace("ethereum_", "")
        .replace("hardhat", "localhost");
};

export const deployContract = async (contractName: any, ...params: any[]) => {
    let _Contract: any = await ethers.getContractFactory(contractName);
    let ct_contract = await _Contract.deploy(...params);
    console.log(
        `deploying => \"${contractName}\" -hash: \"${ct_contract.deployTransaction.hash}\" -nonce: \"${ct_contract.deployTransaction.nonce}\",`,
    );
    await ct_contract.deployed();

    console.log(`deployed => \"${contractName}\": \"${ct_contract.address}\",`);
    return ct_contract;
};

export const linkContract = async (
    contractName: any,
    contractAddress: any,
    contractKey?: any,
) => {
    let ct_contract: any = await ethers.getContractAt(
        contractName,
        contractAddress,
    );
    if (contractKey === undefined) {
        contractKey = contractName;
    }
    console.log(`linked => \"${contractKey}:\" \"${ct_contract.address}\"`);
    return ct_contract;
};

export const writeLog = (text: string, op_ret: any) => {
    console.log(`\"${text}\" -txhash:`, op_ret.hash);
};

export const writeContractsToJsonFile = async (
    contractObjDict: any,
    fileName: any,
) => {
    let jsonData: any = { deployed: {}, linked: {}, upgradeable: {} };
    jsonData["updateTime"] = new Date();
    for (let _contractName in contractObjDict) {
        let contractObj = contractObjDict[_contractName];
        let artifact = await artifacts.readArtifact(_contractName);
        let _blockNumber = "0";
        let operate = "deployed";
        if (contractObj.deployTransaction) {
            _blockNumber = (
                await contractObj.deployTransaction.wait()
            ).blockNumber.toString();
        } else {
            operate = "linked";
        }
        let abiName = artifact.contractName;
        if (abiName === "OJEEFaucet") {
            abiName = "IFaucet";
        }
        if (contractObj.proxy) {
            jsonData[operate][_contractName] = {
                address: contractObj.address,
                block: _blockNumber,
                proxy: contractObj.proxy,
                implementation: contractObj.implementation,
                proxyAdmin: contractObj.proxyAdmin,
                meta: {
                    contract: abiName,
                    path: "contract_abi/" + abiName + ".json",
                },
                legacyAddresses: [],
            };
        } else {
            jsonData[operate][_contractName] = {
                address: contractObj.address,
                block: _blockNumber,
                meta: {
                    contract: abiName,
                    path: "contract_abi/" + abiName + ".json",
                },
                legacyAddresses: [],
            };
        }
    }

    console.log("write to:", fileName);
    fs.writeFileSync(fileName, JSON.stringify(jsonData, null, 4));
};

export const sleep = async (time: any) => {
    return new Promise((resolve) => setTimeout(resolve, time * 1000));
};

export class VWProxyAdminManager {
    _vwProxyAdmin: string;

    constructor(vwProxyAdminObj: string) {
        this._vwProxyAdmin = vwProxyAdminObj;
    }

    async linkProxy(
        contractName: string,
        proxyAddress: string,
    ): Promise<Contract> {
        let ct_Contract: any = await ethers.getContractAt(
            contractName,
            proxyAddress,
        );
        ct_Contract.proxy = proxyAddress;
        ct_Contract.proxyAdmin = this._vwProxyAdmin;

        console.log(
            `linked => \"${contractName}:\" \"${ct_Contract.address}\"`,
        );

        return ct_Contract;
    }

    async deployProxy(
        contractName: string,
        args?: unknown[],
    ): Promise<Contract> {
        console.log("==========>");
        let _impl_Contract: any = await ethers.getContractFactory(contractName);
        let ct_impl = await _impl_Contract.deploy();
        console.log(
            `deploying hash => \"${ct_impl.deployTransaction.hash}\" -nonce: \"${ct_impl.deployTransaction.nonce}\",`,
        );
        await ct_impl.deployed();
        console.log(
            `deploying => \"${contractName}\" -impl: \"${ct_impl.address}\",`,
        );
        let initEncodedData;
        if (args === undefined) {
            initEncodedData = "0x";
        } else {
            initEncodedData = ct_impl.interface.encodeFunctionData(
                "initialize",
                args,
            );
        }
        // TransparentUpgradeableProxy
        const _proxy_Contract = await ethers.getContractFactory(
            "TransparentUpgradeableProxy",
        );
        const ct_TransparentUpgradeableProxy = await _proxy_Contract.deploy(
            ct_impl.address,
            this._vwProxyAdmin,
            initEncodedData,
        );
        await ct_TransparentUpgradeableProxy.deployed();
        console.log(
            `deployed over => \"${contractName}\" : \"${ct_TransparentUpgradeableProxy.address}\", -impl: \"${ct_impl.address}\"`,
        );

        let ct_Contract: any = await ethers.getContractAt(
            contractName,
            ct_TransparentUpgradeableProxy.address,
        );
        ct_Contract.proxy = ct_TransparentUpgradeableProxy.address;
        ct_Contract.implementation = ct_impl.address;
        ct_Contract.proxyAdmin = this._vwProxyAdmin;
        ct_Contract.deployTransaction =
            ct_TransparentUpgradeableProxy.deployTransaction;

        return ct_Contract;
    }
}

export class Manager {
    CONFIG: any;
    RunENV: any;
    filename: string;
    contractObjDict: any = {};
    proxyAdminManagerDict: any = {};

    constructor(staticConfig: any, curConfig: any, runENV: any, filename: any) {
        if (curConfig[runENV] === undefined) {
            curConfig[runENV] = {};
        }
        for (let key in curConfig[runENV]) {
            if (staticConfig[runENV][key] !== undefined) {
                throw new Error("Config key duplicate" + key);
            }
        }
        this.CONFIG = { ...staticConfig[runENV], ...curConfig[runENV] };
        this.RunENV = runENV;
        this.filename = filename;
    }

    async addProxyAdmin(adminAddress: string): Promise<VWProxyAdminManager> {
        if (!this.proxyAdminManagerDict[adminAddress]) {
            let adminObj = await linkContract("VWProxyAdmin", adminAddress);
            this.proxyAdminManagerDict[adminAddress] = new VWProxyAdminManager(
                adminObj,
            );
        }

        return this.proxyAdminManagerDict[adminAddress];
    }

    async deployUpgradeableOrLink(
        contractName: string,
        proxyAdminAddress: string,
        params?: any[],
    ) {
        let ct_contract;
        let proxyAdminManagerObj = await this.addProxyAdmin(proxyAdminAddress);
        if (
            this.CONFIG["deployedContract"] &&
            this.CONFIG.deployedContract[contractName]
        ) {
            ct_contract = await proxyAdminManagerObj.linkProxy(
                contractName,
                this.CONFIG.deployedContract[contractName],
            );
        } else {
            ct_contract = await proxyAdminManagerObj.deployProxy(
                contractName,
                params,
            );
        }

        this.contractObjDict[contractName] = ct_contract;
        await this.writeToJsonFile();
        return ct_contract;
    }

    async deployOrLinkContract(contractName: any, ...params: any[]) {
        let ct_contract;
        if (
            this.CONFIG["deployedContract"] &&
            this.CONFIG.deployedContract[contractName]
        ) {
            ct_contract = await linkContract(
                contractName,
                this.CONFIG.deployedContract[contractName],
            );
        } else {
            ct_contract = await deployContract(contractName, ...params);
        }
        this.contractObjDict[contractName] = ct_contract;
        await this.writeToJsonFile();
        return ct_contract;
    }

    async writeToJsonFile() {
        let fn =
            this.filename.replace(".ts", "") + `-${this.RunENV}-config.json`;
        await writeContractsToJsonFile(this.contractObjDict, fn);
    }
}
