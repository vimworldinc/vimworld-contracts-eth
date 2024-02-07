import { ethers } from "hardhat";
import {
    loadFixture,
    takeSnapshot,
} from "@nomicfoundation/hardhat-network-helpers";
import {
    formatUTContractTitle,
    formatUTPatternTitle,
    anyValue,
    x18,
    MaxUint256,
    getBlockTime,
    ZeroAddress,
    checkPermissionFunctionWithMsg,
    x_n,
    toBig,
    mineIncreasedTime,
    deployContract,
    toFloat,
} from "../utils";
import {
    deployProxyAdmin,
    deployUSDT,
    deployVault,
    deployTestToken,
    deployTestGenericAaveV3WithAave,
    deployUSDTStrategyToLender,
    deployWETH,
    deployTestCurveFi,
    deployTestUniswap,
} from "../contractHelpers";
import { expect } from "chai";
import {
    AAVE_APR,
    AAVE_PERSECOND_APR,
    Ethereum_CurveFi,
    Ethereum_Uniswap,
    Ethereum_WETH,
} from "../contractsConfig";

describe(formatUTContractTitle("USDTStrategyToLender"), function () {
    let VAULT_ASSET = x_n(1000000, 6);
    let vaultGovernance: any;
    let vaultManagement: any;
    let vaultGuardian: any;
    let strategistRoler: any;
    let keeper: any;
    let foundationWallet: any;
    let normalAccount: any;
    let otherAccounts: any;
    let ct_USDTStrategyToLender: any;
    let ct_GenericAaveV3: any;
    let ct_AToken: any;
    let ct_Vault: any;
    let ct_USDT: any;
    let ct_WETH: any;
    let ct_ProxyAdmin: any;

    beforeEach(async () => {
        otherAccounts = await ethers.getSigners();
        vaultGovernance = otherAccounts.shift();
        vaultManagement = otherAccounts.shift();
        vaultGuardian = otherAccounts.shift();
        strategistRoler = otherAccounts.shift();
        keeper = otherAccounts.shift();
        normalAccount = otherAccounts.shift();
        foundationWallet = otherAccounts.shift();
    });

    async function deployContractsFixture() {
        ct_ProxyAdmin = await deployProxyAdmin();
        ct_USDT = await deployUSDT();

        ct_Vault = await deployVault(
            ct_ProxyAdmin,
            ct_USDT,
            vaultGovernance,
            vaultManagement,
            vaultGuardian,
        );
        ct_WETH = await deployWETH();
        ct_USDTStrategyToLender = await deployUSDTStrategyToLender(
            ct_ProxyAdmin,
            ct_Vault,
            ct_WETH,
            ct_USDT,
        );
        await ct_USDTStrategyToLender.setStrategist(strategistRoler.address);

        await ct_Vault.addStrategy(
            ct_USDTStrategyToLender.address,
            10000,
            0,
            MaxUint256,
        );

        ct_GenericAaveV3 = await deployTestGenericAaveV3WithAave(
            ct_ProxyAdmin,
            ct_USDTStrategyToLender,
            ct_USDT,
        );
        await ct_USDTStrategyToLender.addLender(ct_GenericAaveV3.address);
        ct_AToken = await ethers.getContractAt(
            "TestAave",
            await ct_GenericAaveV3.aToken(),
        );
    }

    async function deployContractsAndInitFixture() {
        await deployContractsFixture();

        await ct_USDT.approve(ct_Vault.address, MaxUint256);
        await ct_Vault.deposit(VAULT_ASSET, vaultGovernance.address);
    }

    describe(formatUTPatternTitle("Deployment"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);
        });

        it("Successful: Constructor", async () => {
            expect(
                await ct_USDTStrategyToLender.withdrawalThreshold(),
            ).to.equal(0);
            expect(await ct_USDTStrategyToLender.wantToEthOracle()).to.equal(
                ZeroAddress,
            );
            expect(await ct_USDTStrategyToLender.numLenders()).to.equal(1);
            expect(await ct_USDTStrategyToLender.name()).to.equal(
                "StrategyLenderYieldOptimiser",
            );
            // super
            expect(await ct_USDTStrategyToLender.superUniswapRouter()).to.equal(
                Ethereum_Uniswap,
            );
            expect(await ct_USDTStrategyToLender.superWETH()).to.equal(
                Ethereum_WETH,
            );
        });

        it("Unsuccessful: deployment. \tReason: initialize repeat", async () => {
            await expect(
                ct_USDTStrategyToLender.initialize(ct_Vault.address),
            ).to.be.revertedWith(
                "Initializable: contract is already initialized",
            );
        });

        it("Unsuccessful: deployment. \tReason: initializing", async () => {
            await expect(
                ct_USDTStrategyToLender.toInitUnchained(),
            ).to.be.revertedWith("Initializable: contract is not initializing");
            await expect(
                ct_USDTStrategyToLender.toInitWithBaseStrategy(
                    ct_Vault.address,
                ),
            ).to.be.revertedWith("Initializable: contract is not initializing");
            await expect(
                ct_USDTStrategyToLender.toInitUnchainedWithBaseStrategy(
                    ct_Vault.address,
                ),
            ).to.be.revertedWith("Initializable: contract is not initializing");
        });
    });

    describe(formatUTPatternTitle("Authorization functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);
        });

        it("Successful: test function setParams only by permission", async () => {
            // onlyAuthorized
            await checkPermissionFunctionWithMsg(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian],
                "!Authorized",
                ct_USDTStrategyToLender,
                "setWithdrawalThreshold",
                1000,
            );
            // onlyAuthorized
            await checkPermissionFunctionWithMsg(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian],
                "!Authorized",
                ct_USDTStrategyToLender,
                "setPriceOracle",
                ZeroAddress,
            );
            // onlyAuthorized
            await checkPermissionFunctionWithMsg(
                [],
                [vaultManagement, vaultGuardian],
                "!Authorized",
                ct_USDTStrategyToLender,
                "safeRemoveLender",
                ct_GenericAaveV3.address,
            );
            await expect(
                ct_USDTStrategyToLender
                    .connect(vaultGovernance)
                    .safeRemoveLender(ct_GenericAaveV3.address),
            ).not.to.be.reverted;
            await ct_USDTStrategyToLender.addLender(ct_GenericAaveV3.address);
            await expect(
                ct_USDTStrategyToLender
                    .connect(strategistRoler)
                    .safeRemoveLender(ct_GenericAaveV3.address),
            ).not.to.be.reverted;
            await ct_USDTStrategyToLender.addLender(ct_GenericAaveV3.address);

            // onlyAuthorized
            await checkPermissionFunctionWithMsg(
                [],
                [vaultManagement, vaultGuardian],
                "!Authorized",
                ct_USDTStrategyToLender,
                "forceRemoveLender",
                ct_GenericAaveV3.address,
            );
            await expect(
                ct_USDTStrategyToLender
                    .connect(vaultGovernance)
                    .forceRemoveLender(ct_GenericAaveV3.address),
            ).not.to.be.reverted;
            await ct_USDTStrategyToLender.addLender(ct_GenericAaveV3.address);
            await expect(
                ct_USDTStrategyToLender
                    .connect(strategistRoler)
                    .forceRemoveLender(ct_GenericAaveV3.address),
            ).not.to.be.reverted;
            // onlyGovernance
            await checkPermissionFunctionWithMsg(
                [vaultGovernance],
                [vaultManagement, vaultGuardian, strategistRoler],
                "!Governance",
                ct_USDTStrategyToLender,
                "addLender",
                ct_GenericAaveV3.address,
            );
        });

        it("Successful: Called sweep function only by governance", async () => {
            let ct_newToken = await deployTestToken(normalAccount);
            let amount = 10000;
            await ct_newToken
                .connect(normalAccount)
                .transfer(ct_USDTStrategyToLender.address, amount);

            expect(
                await ct_newToken.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(amount);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(0);

            await checkPermissionFunctionWithMsg(
                [vaultGovernance],
                [vaultManagement, vaultGuardian, strategistRoler],
                "!Governance",
                ct_USDTStrategyToLender,
                "sweep",
                ct_newToken.address,
            );
            await ct_USDTStrategyToLender.sweep(ct_newToken.address);

            expect(
                await ct_newToken.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(0);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(amount);
        });
    });

    describe(formatUTPatternTitle("Config functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);
        });

        it("Successful: test function addLender", async () => {
            // Undocked Lender
            let ct_USDTStrategy2 = await deployUSDTStrategyToLender(
                ct_ProxyAdmin,
                ct_Vault,
                ct_WETH,
                ct_USDT,
            );
            let ct_lenderWithOtherStrategy =
                await deployTestGenericAaveV3WithAave(
                    ct_ProxyAdmin,
                    ct_USDTStrategy2,
                    ct_USDT,
                );
            await expect(
                ct_USDTStrategyToLender.addLender(
                    ct_lenderWithOtherStrategy.address,
                ),
            ).to.be.revertedWith("Undocked Lender");

            // Already added
            await expect(
                ct_USDTStrategyToLender.addLender(ct_GenericAaveV3.address),
            ).to.be.revertedWith("Already added");
        });

        it("Successful: test function safeRemoveLender", async () => {
            let strategy_bal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_GenericAaveV3.address, strategy_bal);
            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(strategy_bal);
            await expect(ct_GenericAaveV3.connect(vaultGovernance).deposit())
                .not.to.be.reverted;
            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(0);

            await mineIncreasedTime(86400);

            // lender is not exists
            await expect(
                ct_USDTStrategyToLender.safeRemoveLender(normalAccount.address),
            ).to.be.revertedWith("Not lender");

            // Aave's usdt is not enough, revert
            expect(
                await ct_AToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.above(await ct_USDT.balanceOf(ct_AToken.address));
            await expect(
                ct_USDTStrategyToLender.safeRemoveLender(normalAccount.address),
            ).to.be.revertedWith("Not lender");

            // Aave's usdt is enough
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, strategy_bal);
            expect(
                await ct_AToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.below(await ct_USDT.balanceOf(ct_AToken.address));

            let snapshot = await takeSnapshot();
            let aTokenBal: any;
            let withdrawAmount: any;
            let receiveAmount: any;
            await expect(
                ct_USDTStrategyToLender.safeRemoveLender(
                    ct_GenericAaveV3.address,
                ),
            )
                .to.emit(ct_AToken, "EventWithdraw")
                .withArgs(
                    ct_GenericAaveV3.address,
                    function (amount: any) {
                        aTokenBal = amount;
                        return true;
                    },
                    function (amount: any) {
                        withdrawAmount = amount;
                        return true;
                    },
                )
                .and.to.emit(ct_USDT, "Transfer")
                .withArgs(
                    ct_GenericAaveV3.address,
                    ct_USDTStrategyToLender.address,
                    function (amount: any) {
                        receiveAmount = amount;
                        return true;
                    },
                );
            expect(receiveAmount).to.be.equal(withdrawAmount);
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(receiveAmount);
            expect(withdrawAmount).to.be.equal(aTokenBal);
            await snapshot.restore();

            // remove from multi lender
            let ct_lender1 = await deployTestGenericAaveV3WithAave(
                ct_ProxyAdmin,
                ct_USDTStrategyToLender,
                ct_USDT,
            );
            await ct_USDTStrategyToLender.addLender(ct_lender1.address);
            await expect(
                ct_USDTStrategyToLender.safeRemoveLender(
                    ct_GenericAaveV3.address,
                ),
            ).not.to.be.reverted;
        });

        it("Successful: test function forceRemoveLender", async () => {
            let strategy_bal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_GenericAaveV3.address, strategy_bal);
            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(strategy_bal);
            await expect(ct_GenericAaveV3.connect(vaultGovernance).deposit())
                .not.to.be.reverted;
            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(0);

            await mineIncreasedTime(86400);

            // lender is not exists
            await expect(
                ct_USDTStrategyToLender.forceRemoveLender(
                    normalAccount.address,
                ),
            ).to.be.revertedWith("Not lender");

            // Aave's usdt is not enough, no revert.
            let usdtBal = await ct_USDT.balanceOf(ct_AToken.address);
            expect(
                await ct_AToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.above(usdtBal);

            // safe remove is revert
            await expect(
                ct_USDTStrategyToLender.safeRemoveLender(
                    ct_GenericAaveV3.address,
                ),
            ).to.be.revertedWith("Withdraw failed");

            let aTokenBal: any;
            let withdrawAmount: any;
            let receiveAmount: any;
            await expect(
                ct_USDTStrategyToLender.forceRemoveLender(
                    ct_GenericAaveV3.address,
                ),
            )
                .to.emit(ct_AToken, "EventWithdraw")
                .withArgs(
                    ct_GenericAaveV3.address,
                    function (amount: any) {
                        aTokenBal = amount;
                        return true;
                    },
                    function (amount: any) {
                        withdrawAmount = amount;
                        return true;
                    },
                )
                .and.to.emit(ct_USDT, "Transfer")
                .withArgs(
                    ct_GenericAaveV3.address,
                    ct_USDTStrategyToLender.address,
                    function (amount: any) {
                        receiveAmount = amount;
                        return true;
                    },
                );
            expect(receiveAmount).to.be.equal(usdtBal);
            expect(receiveAmount).to.be.equal(withdrawAmount);
            expect(withdrawAmount).to.be.equal(aTokenBal);
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(receiveAmount);
        });

        it("Successful: test function manualAllocation", async () => {
            await (
                await ethers.getContractAt(
                    "TestAave",
                    await ct_GenericAaveV3.aToken(),
                )
            ).updateAPR(0);
            let ct_lender1 = await deployTestGenericAaveV3WithAave(
                ct_ProxyAdmin,
                ct_USDTStrategyToLender,
                ct_USDT,
            );
            await (
                await ethers.getContractAt(
                    "TestAave",
                    await ct_lender1.aToken(),
                )
            ).updateAPR(0);
            await ct_USDTStrategyToLender.addLender(ct_lender1.address);
            let ct_lender2 = await deployTestGenericAaveV3WithAave(
                ct_ProxyAdmin,
                ct_USDTStrategyToLender,
                ct_USDT,
            );
            await (
                await ethers.getContractAt(
                    "TestAave",
                    await ct_lender2.aToken(),
                )
            ).updateAPR(0);
            await ct_USDTStrategyToLender.addLender(ct_lender2.address);

            let strategy_bal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_GenericAaveV3.address, strategy_bal);
            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(strategy_bal);
            await expect(ct_GenericAaveV3.connect(vaultGovernance).deposit())
                .not.to.be.reverted;
            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(0);

            let newLenderRatios = [
                {
                    lender: ct_GenericAaveV3.address,
                    share: 400,
                },
                {
                    lender: ct_lender1.address,
                    share: 300,
                },
                {
                    lender: ct_lender2.address,
                    share: 300,
                },
            ];

            // onlyAuthorized
            await checkPermissionFunctionWithMsg(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian],
                "!Authorized",
                ct_USDTStrategyToLender,
                "manualAllocation",
                newLenderRatios,
            );

            await expect(
                ct_USDTStrategyToLender.manualAllocation(newLenderRatios),
            ).not.to.be.reverted;

            let bal0 = toBig(await ct_GenericAaveV3.nav());
            let bal1 = toBig(await ct_lender1.nav());
            let bal2 = toBig(await ct_lender2.nav());
            let total = bal0.add(bal1).add(bal2);

            expect(bal0).to.be.closeTo(
                total.mul(newLenderRatios[0].share).div(1000),
                10,
            );
            expect(bal1).to.be.closeTo(
                total.mul(newLenderRatios[1].share).div(1000),
                10,
            );
            expect(bal2).to.be.closeTo(
                total.mul(newLenderRatios[2].share).div(1000),
                10,
            );

            // lender not exists
            let errorLenderRatios = [
                {
                    lender: normalAccount.address,
                    share: 1000,
                },
            ];
            await expect(
                ct_USDTStrategyToLender.manualAllocation(errorLenderRatios),
            ).to.be.revertedWith("Not lender");

            // share is not equal 1000
            errorLenderRatios = [
                {
                    lender: ct_GenericAaveV3.address,
                    share: 100,
                },
            ];
            await expect(
                ct_USDTStrategyToLender.manualAllocation(errorLenderRatios),
            ).to.be.revertedWith("Share!=1000");
        });

        it("Successful: Called sweep function only by governance", async () => {
            let ct_newToken = await deployTestToken(normalAccount);
            let amount = 10000;
            await ct_newToken
                .connect(normalAccount)
                .transfer(ct_USDTStrategyToLender.address, amount);

            expect(
                await ct_newToken.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(amount);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(0);

            await checkPermissionFunctionWithMsg(
                [vaultGovernance],
                [vaultManagement, vaultGuardian, strategistRoler],
                "!Governance",
                ct_USDTStrategyToLender,
                "sweep",
                ct_newToken.address,
            );

            await ct_USDTStrategyToLender.sweep(ct_newToken.address);

            expect(
                await ct_newToken.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(0);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(amount);
        });
    });

    describe(formatUTPatternTitle("Logic functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsAndInitFixture);
        });

        it("Successful: Called harvest function", async () => {
            let totalAsset = VAULT_ASSET;
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(
                    ct_AToken.address,
                    toBig(await ct_USDT.balanceOf(vaultGovernance.address)).div(
                        10,
                    ),
                );

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0)
                .and.to.emit(ct_Vault, "StrategyReported")
                .withArgs(
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    totalAsset,
                    totalAsset,
                    10000,
                );
            let index = await ct_AToken.index();

            await mineIncreasedTime(86400);

            // change debtRatio to 50%
            let eventHarvestedData_50_profit: any;
            let totalDebt_50: any = totalAsset.div(2);
            await ct_Vault.updateStrategyDebtRatio(
                ct_USDTStrategyToLender.address,
                5000,
            );
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(
                    function (profit: number) {
                        eventHarvestedData_50_profit = profit;
                        return profit > 0;
                    },
                    0,
                    totalAsset.div(2),
                    0,
                )
                .to.be.emit(ct_Vault, "StrategyReported")
                .withArgs(
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    totalDebt_50,
                    0,
                    5000,
                );
            let newIndex = await ct_AToken.index();
            expect(
                toBig(newIndex).mul(totalAsset).div(index).sub(totalAsset),
            ).to.be.equal(eventHarvestedData_50_profit);
            let totalAsset_after50 = totalAsset.add(
                eventHarvestedData_50_profit,
            );
            expect(await ct_Vault.totalAssets()).to.be.equal(
                totalAsset_after50,
            );
            index = newIndex;
            await mineIncreasedTime(86400);

            // change back to 100%.
            let eventHarvestedData_back100_profit: any;
            await ct_Vault.updateStrategyDebtRatio(
                ct_USDTStrategyToLender.address,
                10000,
            );
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(
                    function (profit: number) {
                        eventHarvestedData_back100_profit = profit;
                        return profit > 0;
                    },
                    0,
                    0,
                    0,
                )
                .to.be.emit(ct_Vault, "StrategyReported")
                .withArgs(
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    totalAsset_after50,
                    totalAsset_after50.sub(totalAsset.div(2)),
                    10000,
                );
            newIndex = await ct_AToken.index();
            expect(
                toBig(newIndex).mul(totalDebt_50).div(index).sub(totalDebt_50),
            ).to.be.closeTo(eventHarvestedData_back100_profit, 1);
            expect(await ct_Vault.totalAssets()).to.be.equal(
                totalAsset_after50.add(eventHarvestedData_back100_profit),
            );
        });

        it("Successful: Called withdrawSome function", async () => {
            let totalAsset = VAULT_ASSET;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);
            let harvetTime = 0;
            let timeGap = 0;

            // lender empty asset
            await expect(ct_USDTStrategyToLender.withdrawSome(x_n(100, 6)))
                .to.emit(ct_USDTStrategyToLender, "EventWithdrawSome")
                .withArgs(0);

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);
            harvetTime = await getBlockTime();

            // withdraw amount < withdrawalThreshold, withdrawSome, return 0.
            let withdrawAmount: any = totalAsset.div(2);
            let poolAsset: any = 0;
            await ct_USDTStrategyToLender.setWithdrawalThreshold(
                withdrawAmount.add(1),
            );
            await expect(ct_USDTStrategyToLender.withdrawSome(withdrawAmount))
                .to.emit(ct_USDTStrategyToLender, "EventWithdrawSome")
                .withArgs(0);
            timeGap = (await getBlockTime()) - harvetTime;
            poolAsset = await ct_GenericAaveV3.nav();
            expect(
                AAVE_PERSECOND_APR.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(totalAsset),
            ).to.be.closeTo(poolAsset, 1);

            // withdraw amount >= withdrawalThreshold, withdrawSome, return withdraw amount.
            await ct_USDTStrategyToLender.setWithdrawalThreshold(
                withdrawAmount,
            );
            await expect(ct_USDTStrategyToLender.withdrawSome(withdrawAmount))
                .to.emit(ct_USDTStrategyToLender, "EventWithdrawSome")
                .withArgs(withdrawAmount);
            timeGap = (await getBlockTime()) - harvetTime;
            poolAsset = await ct_GenericAaveV3.nav();
            expect(
                AAVE_PERSECOND_APR.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(totalAsset)
                    .sub(withdrawAmount),
            ).to.be.closeTo(poolAsset, 1);
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(withdrawAmount);

            // multi lenders
            let snapShote = await takeSnapshot();
            let ct_GenericAave_2 = await deployTestGenericAaveV3WithAave(
                ct_ProxyAdmin,
                ct_USDTStrategyToLender,
                ct_USDT,
            );
            let ct_AToken_2 = await ethers.getContractAt(
                "TestAave",
                await ct_GenericAave_2.aToken(),
            );
            await ct_AToken_2.setAprAfterDeposit(0);
            await ct_USDTStrategyToLender.addLender(ct_GenericAave_2.address);

            let newLenderRatios = [
                {
                    lender: ct_GenericAaveV3.address,
                    share: 300,
                },
                {
                    lender: ct_GenericAave_2.address,
                    share: 700,
                },
            ];

            await expect(
                ct_USDTStrategyToLender.manualAllocation(newLenderRatios),
            ).not.to.be.reverted;

            await expect(ct_USDTStrategyToLender.withdrawSome(withdrawAmount))
                .not.to.be.reverted;

            // length == 0
            await snapShote.restore();
            await expect(
                ct_USDTStrategyToLender
                    .connect(strategistRoler)
                    .safeRemoveLender(ct_GenericAaveV3.address),
            ).not.to.be.reverted;
            await expect(ct_USDTStrategyToLender.withdrawSome(withdrawAmount))
                .to.emit(ct_USDTStrategyToLender, "EventWithdrawSome")
                .withArgs(0);
        });

        it("Successful: Called adjustPosition function", async () => {
            let totalAsset = VAULT_ASSET;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);
            let harvetTime = 0;
            let timeGap = 0;
            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);
            harvetTime = await getBlockTime();

            // withdraw all.
            let poolAsset: any = 0;
            await expect(ct_USDTStrategyToLender.liquidateAllPositions())
                .to.emit(ct_USDTStrategyToLender, "EventLiquidateAllPositions")
                .withArgs(function (amount: any) {
                    poolAsset = amount;
                    return true;
                });
            timeGap = (await getBlockTime()) - harvetTime;
            expect(
                AAVE_PERSECOND_APR.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(totalAsset),
            ).to.be.closeTo(poolAsset, 1);
            expect(await ct_GenericAaveV3.nav()).to.be.closeTo(0, 1);
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(poolAsset);

            let snapShot = await takeSnapshot();
            // adjustPosition.
            await expect(ct_USDTStrategyToLender.adjustPosition(0))
                .to.emit(ct_USDTStrategyToLender, "EventAdjustPosition")
                .withArgs(0, poolAsset);
            await snapShot.restore();

            // length == 0
            await expect(
                ct_USDTStrategyToLender
                    .connect(strategistRoler)
                    .safeRemoveLender(ct_GenericAaveV3.address),
            ).not.to.be.reverted;
            let asset = 0;
            await expect(ct_USDTStrategyToLender.adjustPosition(0))
                .to.emit(ct_USDTStrategyToLender, "EventAdjustPosition")
                .withArgs(anyValue, function (amount: any) {
                    asset = amount;
                    return true;
                });
            expect(asset).to.be.closeTo(0, 1);
            await snapShot.restore();

            // emergencyExit
            await ct_USDTStrategyToLender.setEmergencyExit();
            asset = await ct_USDTStrategyToLender.lentTotalAssets();
            await expect(ct_USDTStrategyToLender.adjustPosition(0))
                .to.emit(ct_USDTStrategyToLender, "EventAdjustPosition")
                .withArgs(anyValue, function (amount: any) {
                    asset = amount;
                    return true;
                });
            expect(asset).to.be.closeTo(0, 1);
        });

        it("Successful: Called liquidatePosition function", async () => {
            let totalAsset = VAULT_ASSET;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);
            let index = await ct_AToken.getIndex();
            let aaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            expect(totalAsset.mul(x18(1)).div(index)).to.be.equal(aaveShare);
            await mineIncreasedTime(86400);

            // withdraw some.
            let withdrawAmount: any = totalAsset.div(2);
            let poolAsset: any = 0;
            await expect(ct_USDTStrategyToLender.withdrawSome(withdrawAmount))
                .to.emit(ct_USDTStrategyToLender, "EventWithdrawSome")
                .withArgs(withdrawAmount);
            let newIndex = await ct_AToken.getIndex();
            poolAsset = await ct_GenericAaveV3.nav();
            expect(
                toBig(newIndex).mul(totalAsset).div(index).sub(withdrawAmount),
            ).to.be.closeTo(poolAsset, 1);
            index = newIndex;
            let poolBalance = poolAsset;
            expect(
                await ct_AToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.closeTo(poolBalance, 1);

            aaveShare = aaveShare.sub(withdrawAmount.mul(x18(1)).div(newIndex));
            expect(aaveShare).to.be.equal(
                await ct_AToken.sharesOf(ct_GenericAaveV3.address),
            );

            aaveUSDTBal = aaveUSDTBal.add(totalAsset).sub(withdrawAmount);
            expect(await ct_USDT.balanceOf(ct_AToken.address)).to.be.closeTo(
                aaveUSDTBal,
                1,
            );
            let strategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(strategyBalance).to.be.equal(withdrawAmount);
            await mineIncreasedTime(86400);

            // liquidate amount < Strategy Balance.
            // Strategy Balance is no change, because liquidate asset will be transfer to Strategy
            let liquidateAmount = strategyBalance.div(2);
            await expect(
                ct_USDTStrategyToLender.liquidatePosition(liquidateAmount),
            )
                .to.emit(ct_USDTStrategyToLender, "EventLiquidatePosition")
                .withArgs(liquidateAmount, 0);
            newIndex = await ct_AToken.getIndex();
            poolAsset = await ct_GenericAaveV3.nav();
            expect(toBig(newIndex).mul(poolBalance).div(index)).to.be.closeTo(
                poolAsset,
                1,
            );
            index = newIndex;
            poolBalance = poolAsset;
            expect(
                await ct_AToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.closeTo(poolBalance, 1);

            expect(aaveShare).to.be.equal(
                await ct_AToken.sharesOf(ct_GenericAaveV3.address),
            );
            expect(await ct_USDT.balanceOf(ct_AToken.address)).to.be.closeTo(
                aaveUSDTBal,
                1,
            );
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(strategyBalance);
            await mineIncreasedTime(86400);

            // Strategy Balance < liquidate amount < Strategy totalDebt, cost Strategy Balance and Pool asset
            liquidateAmount = liquidateAmount.add(strategyBalance);
            await expect(
                ct_USDTStrategyToLender.liquidatePosition(liquidateAmount),
            )
                .to.emit(ct_USDTStrategyToLender, "EventLiquidatePosition")
                .withArgs(liquidateAmount, 0);
            newIndex = await ct_AToken.getIndex();
            poolAsset = await ct_GenericAaveV3.nav();
            expect(
                toBig(newIndex)
                    .mul(poolBalance)
                    .div(index)
                    .sub(liquidateAmount.sub(strategyBalance)),
            ).to.be.closeTo(poolAsset, 1);
            index = newIndex;
            poolBalance = poolAsset;

            expect(
                await ct_AToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.closeTo(poolBalance, 1);

            aaveShare = aaveShare.sub(
                liquidateAmount.sub(strategyBalance).mul(x18(1)).div(newIndex),
            );
            expect(aaveShare).to.be.equal(
                await ct_AToken.sharesOf(ct_GenericAaveV3.address),
            );
            aaveUSDTBal = aaveUSDTBal.sub(liquidateAmount.sub(strategyBalance));
            expect(await ct_USDT.balanceOf(ct_AToken.address)).to.be.closeTo(
                aaveUSDTBal,
                1,
            );
            strategyBalance = strategyBalance
                .sub(strategyBalance)
                .add(liquidateAmount);
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(strategyBalance);
            await mineIncreasedTime(86400);

            // Strategy totalDebt < liquidate amount, no revert, pool is empty
            liquidateAmount = (
                await ct_USDTStrategyToLender.estimatedTotalAssets()
            ).mul(2);
            let realliqAmount: any;
            await expect(
                ct_USDTStrategyToLender.liquidatePosition(liquidateAmount),
            )
                .to.emit(ct_USDTStrategyToLender, "EventLiquidatePosition")
                .withArgs(function (amount: any) {
                    realliqAmount = amount;
                    return true;
                }, 0);

            newIndex = await ct_AToken.getIndex();
            poolAsset = await ct_GenericAaveV3.nav();
            let oldPoolAsset = toBig(newIndex).mul(poolBalance).div(index);
            expect(0).to.be.closeTo(poolAsset, 1);
            index = newIndex;
            poolBalance = poolAsset;

            expect(
                await ct_AToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.closeTo(poolBalance, 1);

            aaveShare = aaveShare.sub(oldPoolAsset.mul(x18(1)).div(newIndex));
            expect(aaveShare)
                .to.be.closeTo(
                    await ct_AToken.sharesOf(ct_GenericAaveV3.address),
                    1,
                )
                .and.to.be.closeTo(1, 1);
            aaveUSDTBal = aaveUSDTBal.sub(oldPoolAsset);
            expect(await ct_USDT.balanceOf(ct_AToken.address)).to.be.closeTo(
                aaveUSDTBal,
                10,
            );
            strategyBalance = strategyBalance.add(oldPoolAsset);
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.closeTo(strategyBalance, 10);
        });

        it("Successful: Called liquidateAllPositions function", async () => {
            let totalAsset = VAULT_ASSET;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);

            let index = await ct_AToken.getIndex();
            let poolBalance = await ct_GenericAaveV3.nav();
            let aaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            aaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            let strategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(strategyBalance).to.be.equal(0);

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);
            index = await ct_AToken.getIndex();
            poolBalance = await ct_GenericAaveV3.nav();
            expect(poolBalance).to.be.closeTo(totalAsset, 1);
            aaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            expect(aaveShare).to.be.closeTo(
                poolBalance.mul(x18(1)).div(index),
                1,
            );
            aaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            strategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(strategyBalance).to.be.equal(0);
            await mineIncreasedTime(86400);

            // withdraw all.
            let poolAsset: any = 0;
            await expect(ct_USDTStrategyToLender.liquidateAllPositions())
                .to.emit(ct_USDTStrategyToLender, "EventLiquidateAllPositions")
                .withArgs(function (amount: any) {
                    poolAsset = amount;
                    return true;
                });
            index = await ct_AToken.getIndex();
            poolBalance = await ct_GenericAaveV3.nav();
            expect(poolBalance).to.be.closeTo(0, 1);
            strategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(strategyBalance).to.be.equal(
                aaveShare.mul(index).div(x18(1)),
            );
            aaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            expect(aaveShare).to.be.closeTo(
                poolBalance.mul(x18(1)).div(index),
                1,
            );
            let newAaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            expect(newAaveUSDTBal).to.be.equal(
                aaveUSDTBal.sub(strategyBalance),
            );
            aaveUSDTBal = newAaveUSDTBal;

            await expect(ct_USDTStrategyToLender.harvest()).not.to.be.reverted;
        });

        it("Successful: Called prepareReturn function with empty asset", async () => {
            let totalAsset = 0;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);

            await ct_Vault.withdraw(VAULT_ASSET, vaultGovernance.address, 0);

            let index = await ct_AToken.getIndex();
            let poolBalance = await ct_GenericAaveV3.nav();
            let aaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            aaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            let strategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(strategyBalance).to.be.equal(0);

            // Aave pool APR is 0%.
            await ct_AToken.updateAPR(0);
            await ct_AToken.setIndex(x18(1));

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);
            index = await ct_AToken.getIndex();
            poolBalance = await ct_GenericAaveV3.nav();
            expect(poolBalance).to.be.closeTo(totalAsset, 1);
            aaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            expect(aaveShare).to.be.closeTo(
                poolBalance.mul(x18(1)).div(index),
                1,
            );
            aaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            strategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(strategyBalance).to.be.equal(0);
            await mineIncreasedTime(86400);

            // prepareReturn when debtOutstaning > 0. and profit is 0, loss is 0.
            let debtOutstaning: any = VAULT_ASSET.div(2);
            // if balanceOf(Strategy) == 0, debtPayment == 0.
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(0);
            await expect(ct_USDTStrategyToLender.prepareReturn(debtOutstaning))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(0, 0, 0);
            // if balanceOf(Strategy) < debtOutstaning, debtPayment == balanceOf(Strategy).
            let strategyBal: any = debtOutstaning.div(2);
            await ct_USDT.transfer(
                ct_USDTStrategyToLender.address,
                strategyBal,
            );
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(strategyBal);
            await expect(ct_USDTStrategyToLender.prepareReturn(debtOutstaning))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(0, 0, strategyBal);
            // if balanceOf(Strategy) > debtOutstaning, debtPayment == debtOutstaning.
            await ct_USDT.transfer(
                ct_USDTStrategyToLender.address,
                debtOutstaning.sub(strategyBal).add(10),
            );
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.above(debtOutstaning);
            await expect(ct_USDTStrategyToLender.prepareReturn(debtOutstaning))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(0, 0, debtOutstaning);
        });

        it("Successful: Called prepareReturn function", async () => {
            let totalAsset = VAULT_ASSET;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);

            let index = await ct_AToken.getIndex();
            let poolBalance = await ct_GenericAaveV3.nav();
            let aaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            aaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            let strategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(strategyBalance).to.be.equal(0);

            // Aave pool APR is 0%.
            await ct_AToken.updateAPR(0);
            await ct_AToken.setIndex(x18(1));

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);
            index = await ct_AToken.getIndex();
            poolBalance = await ct_GenericAaveV3.nav();
            expect(poolBalance).to.be.closeTo(totalAsset, 1);
            aaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            expect(aaveShare).to.be.closeTo(
                poolBalance.mul(x18(1)).div(index),
                1,
            );
            aaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            strategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(strategyBalance).to.be.equal(0);
            await mineIncreasedTime(86400);

            // prepareReturn. debtOutstaning is 0. and profit is closeTo 0, loss is 0.
            await expect(ct_USDTStrategyToLender.prepareReturn(0))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(0, 0, 0);
            expect(index).to.be.equal(await ct_AToken.getIndex());
            expect(poolBalance).to.be.equal(await ct_GenericAaveV3.nav());
            expect(aaveShare).to.be.equal(
                await ct_AToken.sharesOf(ct_GenericAaveV3.address),
            );
            expect(aaveUSDTBal).to.be.equal(
                await ct_USDT.balanceOf(ct_AToken.address),
            );
            expect(strategyBalance).to.be.equal(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            );
            await mineIncreasedTime(86400);

            // profit > 0
            await ct_USDTStrategyToLender.adjustPosition(0);
            await ct_AToken.updateAPR(AAVE_APR);
            await mineIncreasedTime(86400);

            // debtOutstaning == 0, balanceOf(Strategy) == profit
            let profit = 0;
            await expect(ct_USDTStrategyToLender.prepareReturn(0))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(
                    function (amount: any) {
                        profit = amount;
                        return amount > 0;
                    },
                    0,
                    0,
                );
            let newIndex = await ct_AToken.getIndex();
            let newPoolBalance = await ct_GenericAaveV3.nav();
            expect(newPoolBalance.add(profit)).to.be.closeTo(
                poolBalance.mul(newIndex).div(index),
                1,
            );
            poolBalance = newPoolBalance;
            let newAaveShare = await ct_AToken.sharesOf(
                ct_GenericAaveV3.address,
            );
            expect(newAaveShare).to.be.equal(
                aaveShare.sub(toBig(profit).mul(x18(1)).div(newIndex)),
            );
            aaveShare = newAaveShare;
            let newAaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            expect(newAaveUSDTBal).to.be.equal(aaveUSDTBal.sub(profit));
            aaveUSDTBal = newAaveUSDTBal;
            let newStrategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(newStrategyBalance).to.be.equal(profit);
            strategyBalance = newStrategyBalance;
            index = newIndex;
            await mineIncreasedTime(86400);

            // 0 < debtOutstaning < PoolAsset, balanceOf(Strategy) == profit + debtOutstaning
            let newProfit = 0;
            let debtOutstaning = totalAsset.div(2);
            await expect(ct_USDTStrategyToLender.prepareReturn(debtOutstaning))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(
                    function (amount: any) {
                        newProfit = amount;
                        return amount > 0;
                    },
                    0,
                    debtOutstaning,
                );
            newIndex = await ct_AToken.getIndex();
            newPoolBalance = await ct_GenericAaveV3.nav();
            expect(
                newPoolBalance
                    .add(newProfit)
                    .add(debtOutstaning)
                    .sub(strategyBalance),
            ).to.be.closeTo(poolBalance.mul(newIndex).div(index), 1);
            poolBalance = newPoolBalance;
            newAaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            expect(newAaveShare).to.be.equal(
                aaveShare.sub(
                    toBig(debtOutstaning.add(newProfit).sub(strategyBalance))
                        .mul(x18(1))
                        .div(newIndex),
                ),
            );
            aaveShare = newAaveShare;
            newAaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            expect(newAaveUSDTBal).to.be.equal(
                aaveUSDTBal.sub(
                    debtOutstaning.add(newProfit).sub(strategyBalance),
                ),
            );
            aaveUSDTBal = newAaveUSDTBal;
            newStrategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(newStrategyBalance).to.be.equal(
                debtOutstaning.add(newProfit),
            );
            strategyBalance = newStrategyBalance;
            profit = newProfit;
            index = newIndex;
            await mineIncreasedTime(86400);

            // debtOutstaning > PoolAsset, balanceOf(Strategy) == profit + totalAsset
            // newLoose < amountToFree
            debtOutstaning = totalAsset.mul(2);
            let snapshot = await takeSnapshot();
            let realDebtPayment: any;
            await expect(ct_USDTStrategyToLender.prepareReturn(debtOutstaning))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(
                    function (amount: any) {
                        newProfit = amount;
                        return amount > 0;
                    },
                    0,
                    function (amount: any) {
                        realDebtPayment = amount;
                        return amount > 0;
                    },
                );
            newIndex = await ct_AToken.getIndex();
            newPoolBalance = await ct_GenericAaveV3.nav();
            expect(newPoolBalance).to.be.closeTo(0, 1);
            expect(
                toBig(newProfit).add(realDebtPayment).sub(strategyBalance),
            ).to.be.closeTo(poolBalance.mul(newIndex).div(index), 10);
            expect(newProfit).to.be.equal(
                aaveShare
                    .mul(newIndex)
                    .div(x18(1))
                    .add(strategyBalance)
                    .sub(totalAsset),
            );
            poolBalance = newPoolBalance;
            newAaveShare = await ct_AToken.sharesOf(ct_GenericAaveV3.address);
            expect(newAaveShare).to.be.closeTo(0, 1);
            aaveShare = newAaveShare;
            newAaveUSDTBal = await ct_USDT.balanceOf(ct_AToken.address);
            expect(newAaveUSDTBal).to.be.equal(
                aaveUSDTBal.sub(
                    realDebtPayment.add(newProfit).sub(strategyBalance),
                ),
            );
            aaveUSDTBal = newAaveUSDTBal;
            newStrategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(newStrategyBalance).to.be.equal(
                realDebtPayment.add(newProfit),
            );
            strategyBalance = newStrategyBalance;
            profit = newProfit;
            index = newIndex;
            await snapshot.restore();

            // newLoose_ > profit_
            await ct_USDTStrategyToLender.setWithdrawalThreshold(
                debtOutstaning,
            );
            await expect(ct_USDTStrategyToLender.adjustPosition(0));
            await expect(
                ct_USDTStrategyToLender.prepareReturn(debtOutstaning.div(2)),
            )
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(0, 0, 0);
        });

        it("Successful: Called prepareReturn function with loss", async () => {
            let totalAsset = VAULT_ASSET;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_Vault.address, aaveUSDTBal);

            aaveUSDTBal = toBig(await ct_USDT.balanceOf(ct_AToken.address));
            let strategyBalance = await ct_USDT.balanceOf(
                ct_USDTStrategyToLender.address,
            );
            expect(strategyBalance).to.be.equal(0);

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest()).not.to.be.reverted;
            let loss = totalAsset.div(10);
            await ct_GenericAaveV3.takeFund(loss);

            // newLoose_ < amountToFree_
            // loss_ < newLoose_
            let debtOutstaning = totalAsset.mul(2);
            let snapshot = await takeSnapshot();
            let newLoss = 0;
            let realDebtPayment: any;
            await expect(ct_USDTStrategyToLender.prepareReturn(debtOutstaning))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(
                    0,
                    function (amount: any) {
                        newLoss = amount;
                        return amount > 0;
                    },
                    function (amount: any) {
                        realDebtPayment = amount;
                        return amount > 0;
                    },
                );
            expect(newLoss).to.be.closeTo(loss, 2);
            expect(totalAsset.sub(loss).sub(loss)).to.be.closeTo(
                realDebtPayment,
                10,
            );
            snapshot.restore();

            // loss_ > newLoose_
            await ct_USDTStrategyToLender.setWithdrawalThreshold(
                debtOutstaning,
            );
            await expect(ct_USDTStrategyToLender.adjustPosition(0));
            await expect(
                ct_USDTStrategyToLender.prepareReturn(debtOutstaning.div(2)),
            )
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(0, 0, 0);

            // newLoose >= amountToFree
            await snapshot.restore();
            await ct_USDTStrategyToLender.setWithdrawalThreshold(0);
            await expect(ct_USDTStrategyToLender.prepareReturn(10))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareReturn")
                .withArgs(
                    0,
                    function (amount: any) {
                        newLoss = amount;
                        return amount > 0;
                    },
                    10,
                );
        });

        it("Successful: Called prepareMigration function", async () => {
            let totalAsset = VAULT_ASSET;
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(
                    ct_AToken.address,
                    toBig(await ct_USDT.balanceOf(vaultGovernance.address)).div(
                        10,
                    ),
                );

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);
            let index = await ct_AToken.index();

            await mineIncreasedTime(86400);

            let migrationAsset: any = 0;
            let totalDebt = (
                await ct_Vault.strategies(ct_USDTStrategyToLender.address)
            ).totalDebt;
            await expect(ct_USDTStrategyToLender.prepareMigration(ZeroAddress))
                .to.emit(ct_USDTStrategyToLender, "EventPrepareMigration")
                .withArgs(function (amount: any) {
                    migrationAsset = amount;
                    return amount > totalDebt;
                });
            let newIndex = await ct_AToken.index();
            expect(
                toBig(newIndex).mul(totalAsset).div(index).sub(totalAsset),
            ).to.be.closeTo(migrationAsset.sub(totalDebt), 1);
            expect(
                await ct_USDT.balanceOf(ct_USDTStrategyToLender.address),
            ).to.be.equal(migrationAsset);
        });

        it("Successful: Called ethToWant function", async () => {
            let amount = x18(100);
            let snapshot = await takeSnapshot();
            let ct_Swap = await ethers.getContractAt(
                "TestUniswap",
                await ct_USDTStrategyToLender.testUniswapRouter(),
            );
            // want == weth
            let totalAsset = VAULT_ASSET;
            await ct_USDTStrategyToLender
                .connect(vaultGovernance)
                .updateConstant(ct_Swap.address, ct_USDT.address);
            expect(await ct_USDTStrategyToLender.ethToWant(amount)).to.be.equal(
                amount,
            );
            await snapshot.restore();

            // wantToEthOracle exist
            let oracle = await deployContract("MockUSDTToEthOracle");
            await ct_USDTStrategyToLender.setPriceOracle(oracle.address);
            let toEthRate = toBig(await oracle.toEthRate());
            expect(await ct_USDTStrategyToLender.ethToWant(amount)).to.be.equal(
                amount.div(toEthRate),
            );
            await snapshot.restore();

            // uniswap
            let uniswapOut = await ct_Swap.getAmountsOut(amount, [
                ct_WETH.address,
                ct_USDT.address,
            ]);
            expect(await ct_USDTStrategyToLender.ethToWant(amount)).to.be.equal(
                uniswapOut[1],
            );
        });

        it("Successful: Called tendTrigger function", async () => {
            let totalAsset = VAULT_ASSET;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);

            // there is not a better APR somewhere else
            expect(await ct_USDTStrategyToLender.tendTrigger(x_n(1, 17))).to.be
                .false;

            // there is a better APR somewhere else
            let ct_GenericAave2 = await deployTestGenericAaveV3WithAave(
                ct_ProxyAdmin,
                ct_USDTStrategyToLender,
                ct_USDT,
            );
            await ct_USDTStrategyToLender.addLender(ct_GenericAave2.address);
            let ct_AToken2 = await ethers.getContractAt(
                "TestAave",
                await ct_GenericAave2.aToken(),
            );
            await ct_AToken2.updateAPR(AAVE_APR * 5);
            await ct_AToken2.setAprAfterDeposit(AAVE_APR * 5);
            expect(await ct_USDTStrategyToLender.tendTrigger(x_n(5, 14))).to.be
                .true;

            // harvestTrigger is true
            await mineIncreasedTime(
                parseInt(await ct_USDTStrategyToLender.maxReportDelay()),
            );
            expect(await ct_USDTStrategyToLender.tendTrigger(0)).to.be.false;
        });

        it("Successful: Called lendStatuses function", async () => {
            let data = await ct_USDTStrategyToLender.lendStatuses();
            expect(await ct_GenericAaveV3.lenderName()).to.be.equal(
                data[0].name,
            );
            expect(ct_GenericAaveV3.address).to.be.equal(data[0].add);
            expect(await ct_GenericAaveV3.nav()).to.be.equal(data[0].assets);
            expect(await ct_GenericAaveV3.apr()).to.be.equal(data[0].rate);
        });

        it("Successful: Called estimatedAPR function", async () => {
            // asset is zero
            expect(await ct_USDTStrategyToLender.estimatedAPR()).to.be.equal(0);

            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);

            // asset > 0
            expect(await ct_USDTStrategyToLender.estimatedAPR()).to.be.above(0);
        });

        it("Successful: Called estimatedFutureAPR function", async () => {
            let totalAsset = VAULT_ASSET;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);

            // lenders
            let highestApr = AAVE_APR * 2;
            let lowestApr = AAVE_APR;
            let ct_GenericAave_2 = await deployTestGenericAaveV3WithAave(
                ct_ProxyAdmin,
                ct_USDTStrategyToLender,
                ct_USDT,
            );
            let ct_AToken_2 = await ethers.getContractAt(
                "TestAave",
                await ct_GenericAave_2.aToken(),
            );
            await ct_AToken_2.updateAPR(highestApr);
            await ct_AToken_2.setAprAfterDeposit(highestApr);
            await ct_USDTStrategyToLender.addLender(ct_GenericAave_2.address);
            let ct_GenericAave_3 = await deployTestGenericAaveV3WithAave(
                ct_ProxyAdmin,
                ct_USDTStrategyToLender,
                ct_USDT,
            );
            let ct_AToken_3 = await ethers.getContractAt(
                "TestAave",
                await ct_GenericAave_3.aToken(),
            );
            await ct_AToken_3.updateAPR(lowestApr);
            await ct_AToken_3.setAprAfterDeposit(lowestApr);
            await ct_USDTStrategyToLender.addLender(ct_GenericAave_3.address);

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);

            let change = totalAsset.div(10);
            // oldDebtLimit_ < newDebtLimit_
            let newDebtLimit = totalAsset.add(change);
            expect(
                await ct_USDTStrategyToLender.estimatedFutureAPR(newDebtLimit),
            ).to.be.equal(toBig(highestApr).mul(x18(1)).div(10000));

            // oldDebtLimit_ > newDebtLimit_
            newDebtLimit = totalAsset.sub(change);
            // asset_ < change_
            expect(
                await ct_USDTStrategyToLender.estimatedFutureAPR(newDebtLimit),
            ).to.be.closeTo(
                toBig(highestApr).mul(x18(1)).div(10000),
                x_n(1, 14),
            );
            // asset_ >= change_
            let newLenderRatios = [
                {
                    lender: ct_GenericAaveV3.address,
                    share: 300,
                },
                {
                    lender: ct_GenericAave_2.address,
                    share: 600,
                },
                {
                    lender: ct_GenericAave_3.address,
                    share: 100,
                },
            ];

            await expect(
                ct_USDTStrategyToLender.manualAllocation(newLenderRatios),
            ).not.to.be.reverted;
            await ct_USDTStrategyToLender.estimatedFutureAPR(newDebtLimit);
        });

        it("Successful: Called estimateAdjustPosition function", async () => {
            let totalAsset = VAULT_ASSET;
            let aaveUSDTBal = toBig(
                await ct_USDT.balanceOf(vaultGovernance.address),
            ).div(10);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_AToken.address, aaveUSDTBal);

            // lenders
            let highestApr = AAVE_APR * 2;
            let lowestApr = AAVE_APR;
            let ct_GenericAave_2 = await deployTestGenericAaveV3WithAave(
                ct_ProxyAdmin,
                ct_USDTStrategyToLender,
                ct_USDT,
            );
            let ct_AToken2 = await ethers.getContractAt(
                "TestAave",
                await ct_GenericAave_2.aToken(),
            );
            await ct_AToken2.updateAPR(highestApr);
            await ct_AToken2.setAprAfterDeposit(highestApr);
            await ct_USDTStrategyToLender.addLender(ct_GenericAave_2.address);
            let ct_GenericAave_3 = await deployTestGenericAaveV3WithAave(
                ct_ProxyAdmin,
                ct_USDTStrategyToLender,
                ct_USDT,
            );
            let ct_AToken_3 = await ethers.getContractAt(
                "TestAave",
                await ct_GenericAave_3.aToken(),
            );
            await ct_AToken_3.setAprAfterDeposit(0);
            await ct_USDTStrategyToLender.addLender(ct_GenericAave_3.address);

            // first harvest, 100% debtRatio
            await expect(ct_USDTStrategyToLender.harvest())
                .to.emit(ct_USDTStrategyToLender, "Harvested")
                .withArgs(0, 0, 0, 0);

            let newLenderRatios = [
                {
                    lender: ct_GenericAaveV3.address,
                    share: 300,
                },
                {
                    lender: ct_GenericAave_2.address,
                    share: 600,
                },
                {
                    lender: ct_GenericAave_3.address,
                    share: 100,
                },
            ];

            await expect(
                ct_USDTStrategyToLender.manualAllocation(newLenderRatios),
            ).not.to.be.reverted;

            let data = await ct_USDTStrategyToLender.estimateAdjustPosition();
            expect(data.lowestApr_).to.be.closeTo(
                toBig(lowestApr).mul(x_n(1, 14)),
                x_n(1, 14),
            );
            expect(data.potential_).to.be.closeTo(
                toBig(highestApr).mul(x_n(1, 14)),
                x_n(1, 14),
            );
        });
    });
});
