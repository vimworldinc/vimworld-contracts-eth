import { expect } from "chai";
import { ethers } from "hardhat";
import {
    loadFixture,
    mine,
    takeSnapshot,
} from "@nomicfoundation/hardhat-network-helpers";
import {
    formatUTContractTitle,
    formatUTPatternTitle,
    checkPermissionFunction,
    x18,
    mineIncreasedTime,
    MaxUint256,
    checkPermissionFunctionWithCustomError,
    anyValue,
    getBlockTime,
    ZeroAddress,
    toBig,
    deployUpgradeableContract,
    deployContract,
} from "../utils";
import {
    deployProxyAdmin,
    deployTestStrategy,
    deployVault,
    deployWETH,
    deployTestCurveFi,
    deployTestLido,
    deployTestWETHStrategyToLido,
    deployTestToken,
} from "../contractHelpers";

import {
    Ethereum_CurveFi,
    Ethereum_StETH,
    Ethereum_WETH,
    STRATEGY_WETHTOLIDO_PACKAGE_VERSION,
} from "../contractsConfig";

describe(formatUTContractTitle("WETHStrategyToLido"), function () {
    let VAULT_ASSET = x18(100);
    let vaultGovernance: any;
    let vaultManagement: any;
    let vaultGuardian: any;
    let strategistRoler: any;
    let keeperRoler: any;
    let rewardRoler: any;
    let owner: any;
    let adminRoler;
    let minter;
    let manager;
    let normalAccount: any;
    let otherAccounts: any[];
    let ct_Vault: any;
    let ct_WETHStrategyToLido: any;
    let ct_CurveFi: any;
    let ct_ProxyAdmin: any;
    let ct_WETH: any;
    let ct_Steth: any;

    beforeEach(async () => {
        otherAccounts = await ethers.getSigners();
        vaultGovernance = otherAccounts.shift();
        owner = vaultGovernance;
        vaultManagement = otherAccounts.shift();
        vaultGuardian = otherAccounts.shift();
        strategistRoler = otherAccounts.shift();
        keeperRoler = otherAccounts.shift();
        rewardRoler = otherAccounts.shift();
        adminRoler = otherAccounts.shift();
        minter = otherAccounts.shift();
        manager = otherAccounts.shift();
        normalAccount = otherAccounts.shift();
    });

    async function deployContractsFixture() {
        ct_ProxyAdmin = await deployProxyAdmin();
        ct_WETH = await deployWETH();

        ct_Vault = await deployVault(
            ct_ProxyAdmin,
            ct_WETH,
            vaultGovernance,
            vaultGuardian,
            vaultManagement,
        );

        ct_Steth = await deployTestLido(ct_ProxyAdmin, "lido steth", "stEth");
        ct_CurveFi = await deployTestCurveFi(ct_ProxyAdmin, ct_Steth);
        await ct_Steth.submitWithoutToken(x18(10000));
        await ct_Steth.transfer(ct_CurveFi.address, x18(10000));

        ct_WETHStrategyToLido = await deployTestWETHStrategyToLido(
            ct_ProxyAdmin,
            ct_Vault,
            ct_CurveFi,
            ct_WETH,
            ct_Steth,
        );
    }

    async function deployContractsAndInitFixture() {
        await deployContractsFixture();

        await owner.sendTransaction({
            to: ct_CurveFi.address,
            value: VAULT_ASSET.mul(2),
        });

        await ct_Vault
            .connect(vaultGovernance)
            .addStrategy(ct_WETHStrategyToLido.address, 10000, 0, MaxUint256);

        await ct_WETH
            .connect(vaultGovernance)
            .approve(ct_Vault.address, MaxUint256);
        await expect(
            ct_WETH
                .connect(vaultGovernance)
                .deposit({ value: VAULT_ASSET.mul(2) }),
        ).not.to.be.reverted;
        await ct_Vault
            .connect(vaultGovernance)
            .deposit(VAULT_ASSET, vaultGovernance.address);
    }

    describe(formatUTPatternTitle("Deployment"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);
        });

        it("Successful: Constructor", async () => {
            expect(await ct_WETHStrategyToLido.strategist()).to.equal(
                owner.address,
            );
            expect(await ct_WETHStrategyToLido.keeper()).to.equal(
                owner.address,
            );
            expect(await ct_WETHStrategyToLido.want()).to.equal(
                ct_WETH.address,
            );
            expect(await ct_WETHStrategyToLido.peg()).to.equal(100);
            expect(await ct_WETHStrategyToLido.reportLoss()).to.equal(false);
            expect(await ct_WETHStrategyToLido.apiVersion()).to.equal(
                STRATEGY_WETHTOLIDO_PACKAGE_VERSION,
            );
            expect(await ct_WETHStrategyToLido.name()).to.equal(
                "StrategyStETHAccumulator",
            );
            expect(await ct_WETHStrategyToLido.delegatedAssets()).to.equal(0);
            expect(await ct_WETHStrategyToLido.emergencyExit()).to.be.false;
            // Should not trigger until it is approved
            expect(await ct_WETHStrategyToLido.harvestTrigger(0)).to.be.false;
            expect(await ct_WETHStrategyToLido.tendTrigger(0)).to.be.false;
            // super
            expect(await ct_WETHStrategyToLido.superStableSwapSTETH()).to.equal(
                Ethereum_CurveFi,
            );
            expect(await ct_WETHStrategyToLido.superWETH()).to.equal(
                Ethereum_WETH,
            );
            expect(await ct_WETHStrategyToLido.superStETH()).to.equal(
                Ethereum_StETH,
            );

            await expect(ct_WETHStrategyToLido.reinitialize()).not.to.be
                .reverted;
        });

        it("UnSuccessful: Constructor with no test", async () => {
            let ct_impl: any = await deployContract("WETHStrategyToLido");

            const initEncodedData = ct_impl.interface.encodeFunctionData(
                "initialize",
                [ct_Vault.address],
            );

            const _proxy_Contract = await ethers.getContractFactory(
                "MockUpgradeableProxy",
            );
            await expect(
                _proxy_Contract.deploy(
                    ct_impl.address,
                    ct_ProxyAdmin.address,
                    initEncodedData,
                ),
            ).to.be.revertedWith("Address: low-level delegate call failed");
        });

        it("Unsuccessful: deployment. \tReason: initialize repeat", async () => {
            await expect(
                ct_WETHStrategyToLido.initialize(ct_Vault.address),
            ).to.be.revertedWith(
                "Initializable: contract is already initialized",
            );
        });

        it("Unsuccessful: deployment. \tReason: initializing", async () => {
            await expect(
                ct_WETHStrategyToLido.toInitUnchained(),
            ).to.be.revertedWith("Initializable: contract is not initializing");
            await expect(
                ct_WETHStrategyToLido.toInitWithBaseStrategy(ct_Vault.address),
            ).to.be.revertedWith("Initializable: contract is not initializing");
            await expect(
                ct_WETHStrategyToLido.toInitUnchainedWithBaseStrategy(
                    ct_Vault.address,
                ),
            ).to.be.revertedWith("Initializable: contract is not initializing");
        });
    });

    describe(formatUTPatternTitle("Authorization functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);

            await ct_WETHStrategyToLido
                .connect(vaultGovernance)
                .setStrategist(strategistRoler.address);
            await ct_WETHStrategyToLido
                .connect(vaultGovernance)
                .setKeeper(keeperRoler.address);
        });

        it("Successful: test function setParams only by permission", async () => {
            // onlyEmergencyAuthorized
            await checkPermissionFunctionWithCustomError(
                [
                    vaultGovernance,
                    vaultManagement,
                    vaultGuardian,
                    strategistRoler,
                ],
                [keeperRoler, normalAccount],
                "ErrorNotEmergencyAuthorized",
                ct_WETHStrategyToLido,
                "updateReferal",
                owner.address,
            );

            // onlyVaultManagers
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement],
                [vaultGuardian, strategistRoler, keeperRoler, normalAccount],
                "ErrorNotVaultManager",
                ct_WETHStrategyToLido,
                "updateMaxSingleTrade",
                x18(10000),
            );

            // onlyVaultManagers
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement],
                [vaultGuardian, strategistRoler, keeperRoler, normalAccount],
                "ErrorNotVaultManager",
                ct_WETHStrategyToLido,
                "updatePeg",
                100,
            );

            // onlyVaultManagers
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement],
                [vaultGuardian, strategistRoler, keeperRoler, normalAccount],
                "ErrorNotVaultManager",
                ct_WETHStrategyToLido,
                "updateReportLoss",
                false,
            );

            // onlyVaultManagers
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement],
                [vaultGuardian, strategistRoler, keeperRoler, normalAccount],
                "ErrorNotVaultManager",
                ct_WETHStrategyToLido,
                "updateDontInvest",
                false,
            );

            // onlyVaultManagers
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement],
                [vaultGuardian, strategistRoler, keeperRoler, normalAccount],
                "ErrorNotVaultManager",
                ct_WETHStrategyToLido,
                "updateSlippageProtectionOut",
                50,
            );

            // onlyEmergencyAuthorized
            await checkPermissionFunctionWithCustomError(
                [
                    vaultGovernance,
                    vaultManagement,
                    vaultGuardian,
                    strategistRoler,
                ],
                [keeperRoler, normalAccount],
                "ErrorNotEmergencyAuthorized",
                ct_WETHStrategyToLido,
                "invest",
                0,
            );

            // onlyEmergencyAuthorized
            await checkPermissionFunctionWithCustomError(
                [
                    vaultGovernance,
                    vaultManagement,
                    vaultGuardian,
                    strategistRoler,
                ],
                [keeperRoler, normalAccount],
                "ErrorNotEmergencyAuthorized",
                ct_WETHStrategyToLido,
                "rescueStuckEth",
            );
        });

        it("Successful: Called sweep function only by governance", async () => {
            let ct_newToken = await deployTestToken(normalAccount);
            let amount = 10000;
            await ct_newToken
                .connect(normalAccount)
                .transfer(ct_WETHStrategyToLido.address, amount);

            expect(
                await ct_newToken.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(amount);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(0);

            await checkPermissionFunctionWithCustomError(
                [vaultGovernance],
                [
                    vaultManagement,
                    vaultGuardian,
                    strategistRoler,
                    keeperRoler,
                    normalAccount,
                ],
                "ErrorNotGovernance",
                ct_WETHStrategyToLido,
                "sweep",
                ct_newToken.address,
            );

            await expect(
                ct_WETHStrategyToLido
                    .connect(vaultGovernance)
                    .sweep(ct_newToken.address),
            ).not.to.be.reverted;

            expect(
                await ct_newToken.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(amount);
        });

        it("Unsuccessful: Called sweep. \tReason: token is protected", async () => {
            await expect(
                ct_WETHStrategyToLido
                    .connect(vaultGovernance)
                    .sweep(ct_Steth.address),
            ).to.be.revertedWithCustomError(
                ct_WETHStrategyToLido,
                "ErrorShouldNotProtected",
            );
        });

        it("Unsuccessful: Called updatePeg. \tReason: exceed limit", async () => {
            await expect(
                ct_WETHStrategyToLido.connect(vaultGovernance).updatePeg(1001),
            ).to.be.revertedWithCustomError(
                ct_WETHStrategyToLido,
                "ErrorPegExceedLimit",
            );
            await expect(
                ct_WETHStrategyToLido.connect(vaultGovernance).updatePeg(1000),
            ).not.to.be.reverted;
        });

        it("Unsuccessful: Called updateSlippageProtectionOut. \tReason: exceed limit", async () => {
            await expect(
                ct_WETHStrategyToLido
                    .connect(vaultGovernance)
                    .updateSlippageProtectionOut(10001),
            ).to.be.revertedWithCustomError(
                ct_WETHStrategyToLido,
                "ErrorSlippageProtectionOutExceedLimit",
            );
            await expect(
                ct_WETHStrategyToLido
                    .connect(vaultGovernance)
                    .updateSlippageProtectionOut(10000),
            ).not.to.be.reverted;
        });

        it("Successful: Called invest function", async () => {
            let amount = x18(1);
            await ct_WETH.deposit({ value: amount });
            expect(await ct_WETH.balanceOf(owner.address)).to.be.equal(amount);
            await ct_WETH.transfer(ct_WETHStrategyToLido.address, amount);

            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(amount);
            expect(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);
            let stETHAmount = await ct_CurveFi.get_dy(0, 1, amount);
            let snapshot = await takeSnapshot();

            // stETHAmount > amount
            expect(stETHAmount).to.be.above(amount);
            await expect(
                ct_WETHStrategyToLido.connect(vaultGovernance).invest(amount),
            ).not.to.be.reverted;

            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);
            expect(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(stETHAmount);

            // stETHAmount < amount
            await snapshot.restore();
            await ct_CurveFi.setEthBaseAmount(x18(100000000));
            await ct_CurveFi.setStEthBaseAmount(x18(99950000));
            stETHAmount = await ct_CurveFi.get_dy(0, 1, amount);
            expect(stETHAmount).to.be.below(amount);
            await expect(
                ct_WETHStrategyToLido.connect(vaultGovernance).invest(amount),
            ).not.to.be.reverted;
        });

        it("Successful: Called rescueStuckEth function", async () => {
            await owner.sendTransaction({
                to: ct_WETHStrategyToLido.address,
                value: x18(1),
            });
            expect(
                await owner.provider.getBalance(ct_WETHStrategyToLido.address),
            ).to.be.equal(x18(1));
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);

            await expect(
                ct_WETHStrategyToLido.connect(vaultGovernance).rescueStuckEth(),
            ).not.to.be.reverted;

            expect(
                await owner.provider.getBalance(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(x18(1));
        });
    });

    describe(formatUTPatternTitle("Logic functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsAndInitFixture);
        });

        it("Successful: Called harvest function", async () => {
            let totalAsset = VAULT_ASSET;
            let harvetTime = 0;
            let timeGap = 0;
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
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
            harvetTime = await getBlockTime();

            // change debtRatio to 50%
            let totalDebt: any = totalAsset;
            let totalDebt_50: any = totalDebt.div(2);
            let debtOutStanding: any = totalDebt.sub(totalDebt_50);
            await ct_Vault.updateStrategyDebtRatio(
                ct_WETHStrategyToLido.address,
                5000,
            );
            // if totalAsset <= totalDebt, debtPayment == 0, no change.
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, debtOutStanding)
                .to.be.emit(ct_Vault, "StrategyReported")
                .withArgs(
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    totalAsset,
                    0,
                    5000,
                );
            expect(await ct_Vault.totalAssets()).to.be.equal(totalAsset);
            // check asset status
            let curPeg = toBig(await ct_WETHStrategyToLido.peg());
            let curStETH = toBig(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            );
            expect(
                await ct_WETHStrategyToLido.estimatedPotentialTotalAssets(),
            ).to.be.equal(curStETH);
            expect(
                await ct_WETHStrategyToLido.estimatedTotalAssets(),
            ).to.be.equal(curStETH.mul(toBig(10000).sub(curPeg)).div(10000));
            // if totalAsset > totalDebt, transfer debtOutStanding to Vault.
            await ct_WETHStrategyToLido.updatePeg(0);
            expect(
                await ct_WETHStrategyToLido.estimatedTotalAssets(),
            ).to.be.above(totalAsset);
            let eventHarvestedData_50_profit: any;
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(
                    function (profit: number) {
                        eventHarvestedData_50_profit = profit;
                        return profit > 0;
                    },
                    0,
                    debtOutStanding,
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
            let totalAsset_after50 = totalAsset.add(
                eventHarvestedData_50_profit,
            );
            expect(await ct_Vault.totalAssets()).to.be.equal(
                totalAsset_after50,
            );

            // change back to 100%.
            let eventHarvestedData_back100_profit: any;
            await ct_Vault.updateStrategyDebtRatio(
                ct_WETHStrategyToLido.address,
                10000,
            );
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0)
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
            expect(await ct_Vault.totalAssets()).to.be.equal(
                totalAsset_after50,
            );
        });

        it("Successful: Called divest function", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);

            let totalAsset = await ct_Steth.balanceOf(
                ct_WETHStrategyToLido.address,
            );
            // withdrawAmount > divestAmount, loss > 0.
            let withdrawAmount: any = totalAsset.div(2);
            let poolAsset: any = totalAsset.sub(withdrawAmount);
            let divestAmount: any = await ct_CurveFi.get_dy(
                1,
                0,
                withdrawAmount,
            );
            await expect(ct_WETHStrategyToLido.divest(withdrawAmount))
                .to.emit(ct_WETHStrategyToLido, "EventDivest")
                .withArgs(divestAmount);
            expect(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(poolAsset);
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(divestAmount);
            expect(divestAmount).to.be.below(withdrawAmount);

            await expect(ct_WETHStrategyToLido.adjustPosition(0))
                .to.emit(ct_WETHStrategyToLido, "EventAdjustPosition")
                .withArgs(0, function (amount: any) {
                    poolAsset = amount;
                    return true;
                });

            // withdrawAmount < divestAmount, loss == 0.
            await ct_CurveFi.setEthBaseAmount(x18(100000000));
            await ct_CurveFi.setStEthBaseAmount(x18(99950000));
            divestAmount = await ct_CurveFi.get_dy(1, 0, withdrawAmount);
            await expect(ct_WETHStrategyToLido.divest(withdrawAmount))
                .to.emit(ct_WETHStrategyToLido, "EventDivest")
                .withArgs(divestAmount);
            expect(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(poolAsset.sub(withdrawAmount));
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(divestAmount);
            expect(divestAmount).to.be.above(withdrawAmount);
        });

        it("Successful: Called adjustPosition function", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);

            // withdraw all.
            let totalAsset = await ct_Steth.balanceOf(
                ct_WETHStrategyToLido.address,
            );
            let poolAsset: any = 0;
            await expect(ct_WETHStrategyToLido.divest(totalAsset))
                .to.emit(ct_WETHStrategyToLido, "EventDivest")
                .withArgs(function (amount: any) {
                    poolAsset = amount;
                    return true;
                });
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(poolAsset);
            expect(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);

            // adjustPosition and dontInvest is true.
            await ct_WETHStrategyToLido
                .connect(vaultGovernance)
                .updateDontInvest(true);
            await expect(ct_WETHStrategyToLido.adjustPosition(0))
                .to.emit(ct_WETHStrategyToLido, "EventAdjustPosition")
                .withArgs(poolAsset, 0);
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(poolAsset);
            expect(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);

            // adjustPosition and dontInvest is false.
            await ct_WETHStrategyToLido
                .connect(vaultGovernance)
                .updateDontInvest(false);
            await expect(ct_WETHStrategyToLido.adjustPosition(0))
                .to.emit(ct_WETHStrategyToLido, "EventAdjustPosition")
                .withArgs(0, function (amount: any) {
                    return amount > 0;
                });
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);
            expect(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.above(0);
        });

        it("Successful: Called liquidatePosition function", async () => {
            let totalAsset = VAULT_ASSET;
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);
            // withdraw some.
            let withdrawAmount: any = totalAsset.div(2);
            let poolAsset: any = 0;
            await expect(ct_WETHStrategyToLido.divest(withdrawAmount))
                .to.emit(ct_WETHStrategyToLido, "EventDivest")
                .withArgs(function (amount: any) {
                    poolAsset = amount;
                    return true;
                });
            let strategyBalance = await ct_WETH.balanceOf(
                ct_WETHStrategyToLido.address,
            );
            expect(strategyBalance).to.be.equal(poolAsset);

            // liquidate amount < Strategy Balance.
            // Strategy Balance is no change, because liquidate asset will be transfer to Strategy
            let liquidateAmount = strategyBalance.div(2);
            let realLiquidate: any;
            await expect(
                ct_WETHStrategyToLido.liquidatePosition(liquidateAmount),
            )
                .to.emit(ct_WETHStrategyToLido, "EventLiquidatePosition")
                .withArgs(function (amount: any) {
                    realLiquidate = amount;
                    return true;
                }, 0);
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(strategyBalance);

            // Strategy Balance < liquidate amount < Strategy totalDebt, cost Strategy Balance and Pool asset
            // loss > 0
            realLiquidate = strategyBalance.add(
                await ct_CurveFi.get_dy(1, 0, liquidateAmount),
            );
            liquidateAmount = liquidateAmount.add(strategyBalance);
            await expect(
                ct_WETHStrategyToLido.liquidatePosition(liquidateAmount),
            )
                .to.emit(ct_WETHStrategyToLido, "EventLiquidatePosition")
                .withArgs(realLiquidate, function (amount: any) {
                    if (liquidateAmount > realLiquidate) {
                        return liquidateAmount.sub(realLiquidate).eq(amount);
                    } else {
                        return realLiquidate.sub(liquidateAmount).eq(amount);
                    }
                });
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(realLiquidate);
            strategyBalance = realLiquidate;
            // Strategy Balance < liquidate amount < Strategy totalDebt, cost Strategy Balance and Pool asset
            // loss == 0
            await ct_CurveFi.setEthBaseAmount(x18(100000000));
            await ct_CurveFi.setStEthBaseAmount(x18(99950000));
            liquidateAmount = toBig(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).div(2);
            realLiquidate = strategyBalance.add(
                await ct_CurveFi.get_dy(1, 0, liquidateAmount),
            );
            liquidateAmount = liquidateAmount.add(strategyBalance);
            await expect(
                ct_WETHStrategyToLido.liquidatePosition(liquidateAmount),
            )
                .to.emit(ct_WETHStrategyToLido, "EventLiquidatePosition")
                .withArgs(liquidateAmount, 0);
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(realLiquidate);
            strategyBalance = realLiquidate;

            // Strategy totalDebt < liquidate amount, no revert, pool is empty
            liquidateAmount = (
                await ct_WETHStrategyToLido.estimatedTotalAssets()
            ).mul(2);
            await expect(
                ct_WETHStrategyToLido.liquidatePosition(liquidateAmount),
            ).to.be.revertedWith("transfer amount exceeds balance");
        });

        it("Successful: Called liquidateAllPositions function", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);

            let totalAsset = await ct_Steth.balanceOf(
                ct_WETHStrategyToLido.address,
            );
            // withdrawAmount > divestAmount, loss > 0.
            let divestAmount: any = await ct_CurveFi.get_dy(1, 0, totalAsset);
            await expect(ct_WETHStrategyToLido.liquidateAllPositions())
                .to.emit(ct_WETHStrategyToLido, "EventLiquidateAllPositions")
                .withArgs(divestAmount);
            expect(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(divestAmount);
        });

        it("Successful: Called prepareReturn function, totalAssets < totalDebt", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);

            // prepareReturn. debtOutstaning is 0.
            let totalAssets_ =
                await ct_WETHStrategyToLido.estimatedTotalAssets();
            let debt = (
                await ct_Vault.strategies(ct_WETHStrategyToLido.address)
            ).totalDebt;
            // totalAssets < debt
            expect(totalAssets_).to.be.below(debt);
            // reportLoss is true
            await ct_WETHStrategyToLido.updateReportLoss(true);
            await expect(ct_WETHStrategyToLido.prepareReturn(0))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(0, debt.sub(totalAssets_), 0);

            // reportLoos is false
            await ct_WETHStrategyToLido.updateReportLoss(false);
            await expect(ct_WETHStrategyToLido.prepareReturn(0))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(0, 0, 0);
        });

        it("Successful: Called prepareReturn function, totalAssets > totalDebt and wantBalance > withdrawAmount", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);
            let totalAsset = await ct_Steth.balanceOf(
                ct_WETHStrategyToLido.address,
            );

            // prepareReturn. wantBalance > withdrawAmount, loss must be 0.
            let totalAssets_ =
                await ct_WETHStrategyToLido.estimatedTotalAssets();
            let debt = (
                await ct_Vault.strategies(ct_WETHStrategyToLido.address)
            ).totalDebt;
            // totalAssets < debt
            expect(totalAssets_).to.be.below(debt);
            // wantBalance > profit + debtOutStanding, profit > 0
            let debtOutStanding = debt.sub(totalAssets_).sub(1);
            let profit = debt.div(1000);
            let wantBalance = profit.add(debtOutStanding).add(1);
            await ct_WETH
                .connect(vaultGovernance)
                .transfer(ct_WETHStrategyToLido.address, wantBalance);

            await expect(ct_WETHStrategyToLido.prepareReturn(debtOutStanding))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(profit, 0, debtOutStanding);
        });

        it("Successful: Called prepareReturn function, totalAssets > totalDebt and wantBalance < withdrawAmount and profit > loss", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);

            // prepareReturn. wantBalance > withdrawAmount, and maxSingleTrade >= withdrawAmount.
            let totalAssets_ =
                await ct_WETHStrategyToLido.estimatedTotalAssets();
            let debt = (
                await ct_Vault.strategies(ct_WETHStrategyToLido.address)
            ).totalDebt;
            // totalAssets < debt
            expect(totalAssets_).to.be.below(debt);
            // wantBalance < profit + debtOutStanding, profit > 0
            let wantBalance = debt.div(1000).add(debt.sub(totalAssets_));
            let debtOutStanding = wantBalance.mul(2);
            await ct_WETH
                .connect(vaultGovernance)
                .transfer(ct_WETHStrategyToLido.address, wantBalance);

            // profit > loss, and profit > 0
            totalAssets_ = await ct_WETHStrategyToLido.estimatedTotalAssets();
            expect(totalAssets_).to.be.above(debt);
            let profit = totalAssets_.sub(debt);

            expect(await ct_CurveFi.get_dy(1, 0, wantBalance)).to.be.below(
                wantBalance,
            );
            let withdrawAmount = debtOutStanding.add(profit);
            let realProfit = profit.sub(
                withdrawAmount.sub(
                    await ct_CurveFi.get_dy(1, 0, withdrawAmount),
                ),
            );
            await expect(ct_WETHStrategyToLido.prepareReturn(debtOutStanding))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(realProfit, 0, debtOutStanding);
        });

        it("Successful: Called prepareReturn function, totalAssets > totalDebt and wantBalance < withdrawAmount and profit < loss", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);

            // prepareReturn. wantBalance > withdrawAmount, and maxSingleTrade >= withdrawAmount.
            let totalAssets_ =
                await ct_WETHStrategyToLido.estimatedTotalAssets();
            let debt = (
                await ct_Vault.strategies(ct_WETHStrategyToLido.address)
            ).totalDebt;
            // totalAssets < debt
            expect(totalAssets_).to.be.below(debt);

            // if wantBalance > 0, and profit > 0
            let profit = 10;
            let wantBalance = debt.sub(totalAssets_).add(10);
            let debtOutStanding = wantBalance.add(x18(1));
            await ct_WETH
                .connect(vaultGovernance)
                .transfer(ct_WETHStrategyToLido.address, wantBalance);

            // profit < loss, and profit == 0, loss > 0
            // profit is too small, and loss withdrawAmount is large than profit
            let withdrawAmount = debtOutStanding.add(profit);
            let realWithdrawAmount = await ct_CurveFi.get_dy(
                1,
                0,
                withdrawAmount,
            );
            let loss = withdrawAmount.sub(realWithdrawAmount);
            expect(loss).to.be.above(profit);
            // now, wantBalance > loss.sub(profit), so real debtPayment == debtOutStanding
            await expect(ct_WETHStrategyToLido.prepareReturn(debtOutStanding))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(0, loss.sub(profit), debtOutStanding);
            // wantBalance > withdrawAmount
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(realWithdrawAmount.add(wantBalance));

            // to invest all, and wantBalance is 0.
            await ct_WETHStrategyToLido.adjustPosition(0);
            totalAssets_ = await ct_WETHStrategyToLido.estimatedTotalAssets();
            expect(
                await ct_WETH.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);

            await ct_Steth.handleReport(400);
            totalAssets_ = await ct_WETHStrategyToLido.estimatedTotalAssets();
            expect(totalAssets_).to.be.above(debt);
            profit = totalAssets_.sub(debt);

            debtOutStanding = debt;
            withdrawAmount = totalAssets_;
            realWithdrawAmount = await ct_CurveFi.get_dy(1, 0, withdrawAmount);
            loss = withdrawAmount.sub(realWithdrawAmount);
            // if wantBalance < (loss), so debtPayment < debtOutStanding
            expect(loss).to.be.above(profit);
            wantBalance = await ct_WETH.balanceOf(
                ct_WETHStrategyToLido.address,
            );
            expect(loss.sub(profit)).to.be.above(wantBalance);
            let debtPayment = debtOutStanding.sub(loss.sub(profit));
            await expect(ct_WETHStrategyToLido.prepareReturn(debtOutStanding))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(0, loss.sub(profit), debtPayment);

            wantBalance = await ct_WETH.balanceOf(
                ct_WETHStrategyToLido.address,
            );
            expect(wantBalance).to.be.equal(debtPayment);
        });

        it("Successful: Called prepareReturn function, totalAssets > totalDebt and wantBalance < withdrawAmount and maxSingleTrade < withdrawAmount", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);

            // prepareReturn. wantBalance > withdrawAmount, and maxSingleTrade >= withdrawAmount.
            let totalAssets_ =
                await ct_WETHStrategyToLido.estimatedTotalAssets();
            let debt = (
                await ct_Vault.strategies(ct_WETHStrategyToLido.address)
            ).totalDebt;
            // totalAssets < debt
            expect(totalAssets_).to.be.below(debt);

            // if wantBalance == 0, and profit > 0
            await ct_WETHStrategyToLido.updatePeg(0);
            totalAssets_ = await ct_WETHStrategyToLido.estimatedTotalAssets();
            expect(totalAssets_).to.be.above(debt);

            // if maxSingleTrade == 0, then profit == 0, loss == 0, debtPayment == 0
            await ct_WETHStrategyToLido.updateMaxSingleTrade(0);
            let debtOutStanding = totalAssets_.div(5);
            await expect(ct_WETHStrategyToLido.prepareReturn(debtOutStanding))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(0, 0, 0);

            // if maxSingleTrade < profit, then profit == maxSingleTrade - loss, loss == 0, debtPayment == 0
            let profit = totalAssets_.sub(debt);
            let maxSingleTrade = profit.sub(100);
            await ct_WETHStrategyToLido.updateMaxSingleTrade(maxSingleTrade);
            let realWithdrawAmount = await ct_CurveFi.get_dy(
                1,
                0,
                maxSingleTrade,
            );
            let loss = maxSingleTrade.sub(realWithdrawAmount);
            await expect(ct_WETHStrategyToLido.prepareReturn(debtOutStanding))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(maxSingleTrade.sub(loss), 0, 0);

            // if profit < maxSingleTrade < debtOutStanding+profit,
            // then profit > 0, loss == 0, debtPayment == maxSingleTrade - profit
            await ct_WETHStrategyToLido.adjustPosition(0);
            totalAssets_ = await ct_WETHStrategyToLido.estimatedTotalAssets();
            profit = totalAssets_.sub(debt);
            maxSingleTrade = profit.add(debtOutStanding.div(2));
            await ct_WETHStrategyToLido.updateMaxSingleTrade(maxSingleTrade);
            realWithdrawAmount = await ct_CurveFi.get_dy(1, 0, maxSingleTrade);
            loss = maxSingleTrade.sub(realWithdrawAmount);
            await expect(ct_WETHStrategyToLido.prepareReturn(debtOutStanding))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(
                    profit.sub(loss),
                    0,
                    realWithdrawAmount.sub(profit.sub(loss)),
                );

            // maxSingleTrade > debtOutStanding+profit,
            // then profit = profit - loss, loss == 0, debtPayment == debtOutStanding
            await ct_WETHStrategyToLido.adjustPosition(0);
            totalAssets_ = await ct_WETHStrategyToLido.estimatedTotalAssets();
            profit = totalAssets_.sub(debt);
            maxSingleTrade = x18(10000);
            await ct_WETHStrategyToLido.updateMaxSingleTrade(maxSingleTrade);
            let withdrawAmount = debtOutStanding.add(profit);
            realWithdrawAmount = await ct_CurveFi.get_dy(1, 0, withdrawAmount);
            loss = withdrawAmount.sub(realWithdrawAmount);
            await expect(ct_WETHStrategyToLido.prepareReturn(debtOutStanding))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(profit.sub(loss), 0, debtOutStanding);
        });

        it("Successful: Called prepareReturn function, totalAssets > totalDebt and wantBalance < withdrawAmount and withdrawAmount < realWithdrawAmount", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);

            // prepareReturn. wantBalance > withdrawAmount, and maxSingleTrade >= withdrawAmount.
            let totalAssets_ =
                await ct_WETHStrategyToLido.estimatedTotalAssets();
            let debt = (
                await ct_Vault.strategies(ct_WETHStrategyToLido.address)
            ).totalDebt;
            // totalAssets < debt
            expect(totalAssets_).to.be.below(debt);

            // profit > 0
            await ct_WETHStrategyToLido.updatePeg(0);
            totalAssets_ = await ct_WETHStrategyToLido.estimatedTotalAssets();
            expect(totalAssets_).to.be.above(debt);

            // if withdrawAmount < realWithdrawAmount
            // then realProfit = profit, loss == 0, debtPayment > debtOutStanding
            await ct_WETHStrategyToLido.adjustPosition(0);
            totalAssets_ = await ct_WETHStrategyToLido.estimatedTotalAssets();
            let profit = totalAssets_.sub(debt);
            let debtOutStanding = totalAssets_.div(5);
            let withdrawAmount = debtOutStanding.add(profit);
            await ct_CurveFi.setEthBaseAmount(x18(100000000));
            await ct_CurveFi.setStEthBaseAmount(x18(99950000));
            let realWithdrawAmount = await ct_CurveFi.get_dy(
                1,
                0,
                withdrawAmount,
            );
            expect(realWithdrawAmount).to.be.above(withdrawAmount);
            await expect(ct_WETHStrategyToLido.prepareReturn(debtOutStanding))
                .to.emit(ct_WETHStrategyToLido, "EventPrepareReturn")
                .withArgs(profit, 0, debtOutStanding);
            let wantBalance = await ct_WETH.balanceOf(
                ct_WETHStrategyToLido.address,
            );
            expect(debtOutStanding.add(profit)).to.be.below(wantBalance);
        });

        it("Successful: Called prepareMigration function to other wallet", async () => {
            await expect(
                ct_WETHStrategyToLido.prepareMigration(normalAccount.address),
            )
                .to.emit(ct_WETHStrategyToLido, "EventPrepareMigration")
                .withArgs(0);

            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);
            let totalAsset = await ct_Steth.balanceOf(
                ct_WETHStrategyToLido.address,
            );

            await expect(
                ct_WETHStrategyToLido.prepareMigration(normalAccount.address),
            )
                .to.emit(ct_WETHStrategyToLido, "EventPrepareMigration")
                .withArgs(0);
            expect(
                await ct_Steth.balanceOf(ct_WETHStrategyToLido.address),
            ).to.be.equal(0);
            expect(await ct_Steth.balanceOf(normalAccount.address)).to.be.equal(
                totalAsset,
            );
        });

        it("Unsuccessful: Called prepareMigration function. \tReason: zero wallet", async () => {
            // first harvest, 100% debtRatio
            await expect(ct_WETHStrategyToLido.harvest())
                .to.emit(ct_WETHStrategyToLido, "Harvested")
                .withArgs(0, 0, 0, 0);

            await expect(
                ct_WETHStrategyToLido.prepareMigration(ZeroAddress),
            ).to.be.revertedWith("transfer to the zero address");
        });
    });
});
