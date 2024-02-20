import { ethers, network } from "hardhat";
import {
    mine,
    time,
    takeSnapshot,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { NumberLike } from "@nomicfoundation/hardhat-network-helpers/dist/src/types";
export { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

export const ZeroAddress = ethers.constants.AddressZero;
export const DEFAULT_ADMIN_ROLE = ethers.constants.HashZero;
export const ADMIN_ROLE = ethers.utils.id("ADMIN_ROLE");
export const MaxUint256 = ethers.constants.MaxUint256;

export const EARNSIGNER = ethers.Wallet.createRandom();

export const mineToTheTimeBlock = async (theTime: NumberLike) => {
    await time.increaseTo(theTime);
};

export const mineIncreasedTime = async (incTime: any) => {
    await time.increaseTo((await getBlockTime()) + incTime);
};

export const getBlockTime = async () => {
    return await time.latest();
};

export const toBig = (value: number | BigNumber | string) => {
    return ethers.utils.parseUnits(value.toString(), 0);
};

export const x18 = (value: number | string) => {
    return ethers.utils.parseEther(value.toString());
};

export const x_n = (value: number, unitName: BigNumberish | undefined) => {
    return ethers.utils.parseUnits(value.toString(), unitName);
};

export const toFloat = (value: any, unitName: BigNumberish | undefined) => {
    return ethers.utils.formatUnits(toBig(value.toString()), unitName);
};

export const toHex = (covertThis: any, padding: number) => {
    return ethers.utils.hexZeroPad(ethers.utils.hexlify(covertThis), padding);
};

export const toBytes = (amount: any) => {
    return "0x" + toHex(amount, 32).substr(2);
};

export const deployContract = async (contractName: string, ...params: any) => {
    let _Contract: any = await ethers.getContractFactory(contractName);
    return await _Contract.deploy(...params);
};

export const formatUTContractTitle = (title: string) => {
    return `Contract - ${title}`;
};

export const formatUTPatternTitle = (title: string) => {
    return `${title} =>`;
};

export const deployUpgradeableContract = async (
    contractName: any,
    proxyAdmin: any,
    ...params: any[]
) => {
    let _impl_Contract: any = await ethers.getContractFactory(contractName);
    let ct_impl = await _impl_Contract.deploy();
    await ct_impl.deployed();

    const initEncodedData = ct_impl.interface.encodeFunctionData(
        "initialize",
        ...params,
    );

    // MockUpgradeableProxy
    const _proxy_Contract = await ethers.getContractFactory(
        "MockUpgradeableProxy",
    );
    const ct_MockUpgradeableProxy = await _proxy_Contract.deploy(
        ct_impl.address,
        proxyAdmin.address,
        initEncodedData,
    );

    let ct_Contract: any = await ethers.getContractAt(
        contractName,
        ct_MockUpgradeableProxy.address,
    );
    ct_Contract.proxy = ct_MockUpgradeableProxy;
    ct_Contract.implementation = ct_impl;

    return ct_Contract;
};

export const checkPermissionFunction = async (
    successAccounts: any,
    failureAccounts: any,
    contractObj: any,
    functionName: any,
    ...params: any
) => {
    for (let account of successAccounts) {
        await expect(contractObj.connect(account)[functionName](...params)).not
            .to.be.reverted;
    }
    for (let account of failureAccounts) {
        await expect(contractObj.connect(account)[functionName](...params)).to
            .be.reverted;
    }
};

export const checkPermissionFunctionWithMsg = async (
    successAccounts: any,
    failureAccounts: any,
    failureMsg: any,
    contractObj: any,
    functionName: any,
    ...params: any
) => {
    await failurePermissionFunctionWithMsg(
        failureAccounts,
        failureMsg,
        contractObj,
        functionName,
        ...params,
    );
    let snapshot = await takeSnapshot();
    for (let account of successAccounts) {
        await expect(contractObj.connect(account)[functionName](...params)).not
            .to.be.reverted;
        await snapshot.restore();
    }
};

export const failurePermissionFunctionWithMsg = async (
    failureAccounts: any,
    failureMsg: any,
    contractObj: any,
    functionName: any,
    ...params: any
) => {
    for (let account of failureAccounts) {
        await expect(
            contractObj.connect(account)[functionName](...params),
        ).to.be.revertedWith(failureMsg);
    }
};

export const checkPermissionFunctionWithCustomError = async (
    successAccounts: any,
    failureAccounts: any,
    customErrorName: any,
    contractObj: any,
    functionName: any,
    ...params: any
) => {
    await failurePermissionFunctionWithCustomError(
        failureAccounts,
        customErrorName,
        contractObj,
        functionName,
        ...params,
    );
    let snapshot = await takeSnapshot();
    for (let account of successAccounts) {
        await expect(contractObj.connect(account)[functionName](...params)).not
            .to.be.reverted;
        await snapshot.restore();
    }
};

export const failurePermissionFunctionWithCustomError = async (
    failureAccounts: any,
    customErrorName: any,
    contractObj: any,
    functionName: any,
    ...params: any
) => {
    for (let account of failureAccounts) {
        await expect(
            contractObj.connect(account)[functionName](...params),
        ).to.be.revertedWithCustomError(contractObj, customErrorName);
    }
};

export const deployUpgradeableTestContract = async (
    contractName: any,
    proxyAdmin: any,
    ...params: any[]
) => {
    let _impl_Contract: any = await ethers.getContractFactory(contractName);
    let ct_impl = await _impl_Contract.deploy();
    await ct_impl.deployed();

    const initEncodedData = ct_impl.interface.encodeFunctionData(
        "testinitialize",
        ...params,
    );

    // MockUpgradeableProxy
    const _proxy_Contract = await ethers.getContractFactory(
        "MockUpgradeableProxy",
    );
    const ct_MockUpgradeableProxy = await _proxy_Contract.deploy(
        ct_impl.address,
        proxyAdmin.address,
        initEncodedData,
    );

    let ct_Contract: any = await ethers.getContractAt(
        contractName,
        ct_MockUpgradeableProxy.address,
    );
    ct_Contract.proxy = ct_MockUpgradeableProxy;
    ct_Contract.implementation = ct_impl;

    return ct_Contract;
};
