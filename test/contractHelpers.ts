import {
    deployContract,
    deployUpgradeableContract,
    x18,
    x_n,
    MaxUint256,
    deployUpgradeableTestContract,
} from "./utils";
import { ethers } from "hardhat";
import "./contractsConfig";
import {
    USDTTotalSupply,
    ERC20TokenFarmPool_REWARD_APR,
    TestTokenTotalSupply,
    AAVE_APR,
} from "./contractsConfig";

export { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

export const deployWETH = async () => {
    return await deployContract("WETH");
};

export const deployTestCurveFi = async (ct_ProxyAdmin: any, ct_StETH: any) => {
    return await deployUpgradeableContract("TestCurveFi", ct_ProxyAdmin, [
        ct_StETH.address,
    ]);
};

export const deployProxyAdmin = async () => {
    return await deployContract("MockProxyAdmin");
};

export const deployVault = async (
    ct_ProxyAdmin: any,
    ct_WETH: any,
    governance: any,
    guardian: any,
    management: any,
) => {
    let ct_Vault = await deployUpgradeableContract("MockVault", ct_ProxyAdmin, [
        ct_WETH.address,
        governance.address,
        (await ct_WETH.symbol()) + " yVault",
        "yv" + (await ct_WETH.symbol()),
        guardian.address,
        management.address,
    ]);
    await ct_Vault.connect(governance).setDepositLimit(x18(100000000000));
    return ct_Vault;
};

export const deployTestWETHStrategyToLido = async (
    ct_ProxyAdmin: any,
    ct_Vault: any,
    ct_CurveFi: any,
    ct_WETH: any,
    ct_Steth: any,
) => {
    let strategy = await deployUpgradeableTestContract(
        "TestWETHStrategyToLido",
        ct_ProxyAdmin,
        [ct_Vault.address],
    );

    await strategy.init_eth_contracts(
        ct_CurveFi.address,
        ct_WETH.address,
        ct_Steth.address,
    );
    return strategy;
};

export const deployTestLido = async (
    ct_ProxyAdmin: any,
    name: any,
    symbol: any,
) => {
    return await deployUpgradeableContract("TestLido", ct_ProxyAdmin, [
        name,
        symbol,
    ]);
};

export const deployCommonHealthCheck = async () => {
    return await deployContract("MockCommonHealthCheck");
};

export const deployTestStrategy = async (ct_ProxyAdmin: any, ct_Vault: any) => {
    return await deployUpgradeableContract("TestStrategy", ct_ProxyAdmin, [
        ct_Vault.address,
    ]);
};

export const deployOJEE = async () => {
    let [owner] = await ethers.getSigners();
    return await deployContract("OJEE", owner.address);
};

export const deployTestToken = async (account: any) => {
    return await deployContract(
        "TestToken",
        TestTokenTotalSupply,
        account.address,
    );
};

export const deployPOWA = async (mintersList?: any[]) => {
    let ct_POWA = await deployContract("POWA");
    if (mintersList === undefined) {
        return ct_POWA;
    }
    for (let minterAddr of mintersList) {
        await ct_POWA.setMinter(minterAddr);
    }
    return ct_POWA;
};

export const deployUSDT = async () => {
    let [owner] = await ethers.getSigners();
    return await deployContract("USDTERC20", USDTTotalSupply, owner.address);
};

export const deployTokens = async (): Promise<any> => {
    let ct_OJEE = await deployOJEE();
    let ct_POWA = await deployPOWA();
    let ct_USDT = await deployUSDT();
    return {
        OJEE: ct_OJEE,
        POWA: ct_POWA,
        USDT: ct_USDT,
    };
};

export const deployERC20TokenFarmPool = async (
    ct_ProxyAdmin: any,
    ct_ERC20Token: any,
) => {
    let ct_ERC20TokenFarmPool = await deployUpgradeableContract(
        "MockERC20TokenFarmPool",
        ct_ProxyAdmin,
        [ct_ERC20Token.address, ERC20TokenFarmPool_REWARD_APR],
    );

    await ct_ERC20Token.transfer(ct_ERC20TokenFarmPool.address, x18(1000000));
    await ct_ERC20Token.approve(ct_ERC20TokenFarmPool.address, MaxUint256);
    return ct_ERC20TokenFarmPool;
};

export const deployTestGenericAaveV3 = async (
    ct_ProxyAdmin: any,
    ct_Strategy: any,
    protocolDataProviderAddress: any,
) => {
    return await deployUpgradeableTestContract(
        "TestGenericAaveV3",
        ct_ProxyAdmin,
        [ct_Strategy.address, protocolDataProviderAddress, "AaveV3"],
    );
};

export const deployTestAave = async (
    ct_ProxyAdmin: any,
    ct_ERC20Token: any,
) => {
    let ct_TestAave = await deployUpgradeableContract(
        "TestAave",
        ct_ProxyAdmin,
        ["AToken", "AToken", ct_ERC20Token.address, AAVE_APR],
    );

    return [
        await deployContract("TestProtocolDataProvider", ct_TestAave.address),
        ct_TestAave,
    ];
};

export const deployTestUniswap = async (
    ct_ProxyAdmin: any,
    ct_USDT: any,
    ct_WETH: any,
) => {
    return await deployContract(
        "TestUniswap",
        [ct_USDT.address, ct_WETH.address],
        [x_n(1, 6), x18(1).div(2000)],
    );
};

export const deployUSDTStrategyToLender = async (
    ct_ProxyAdmin: any,
    ct_Vault: any,
    ct_WETH: any,
    ct_USDT: any,
) => {
    let ct_USDTStrategyToLender = await deployUpgradeableContract(
        "TestUSDTStrategyToLender",
        ct_ProxyAdmin,
        [ct_Vault.address],
    );

    let ct_UniswapRouter: any = await deployTestUniswap(
        ct_ProxyAdmin,
        ct_USDT,
        ct_WETH,
    );
    await ct_USDTStrategyToLender.updateConstant(
        ct_UniswapRouter.address,
        ct_WETH.address,
    );
    return ct_USDTStrategyToLender;
};

export const deployTestGenericAaveV3WithAave = async (
    ct_ProxyAdmin: any,
    ct_USDTStrategyToLender: any,
    ct_USDT: any,
) => {
    let [ct_TestProtocolDataPrivider, ct_AToken] = await deployTestAave(
        ct_ProxyAdmin,
        ct_USDT,
    );
    return await deployTestGenericAaveV3(
        ct_ProxyAdmin,
        ct_USDTStrategyToLender,
        ct_TestProtocolDataPrivider.address,
    );
};
