import { ethers } from "hardhat";
import {
    loadFixture,
    takeSnapshot,
} from "@nomicfoundation/hardhat-network-helpers";
import {
    deployUpgradeableContract,
    formatUTContractTitle,
    formatUTPatternTitle,
    anyValue,
    x18,
    MaxUint256,
    getBlockTime,
    ZeroAddress,
    deployContract,
    toBig,
} from "../utils";
import {
    deployProxyAdmin,
    deployOJEE,
    deployERC20TokenFarmPool,
    deployVault,
    deployTestToken,
} from "../contractHelpers";
import { expect } from "chai";
import {
    ERC20TokenFarmPool_PERSECOND_RATE,
    ERC20TokenFarmPool_REWARD_APR,
    Ethereum_CurveFi,
    Ethereum_WETH,
} from "../contractsConfig";

describe(formatUTContractTitle("OJEEStrategyToFarm"), function () {
    let VAULT_ASSET = x18(1000000);
    let vaultGovernance: any;
    let vaultManagement: any;
    let vaultGuardian: any;
    let strategistRoler: any;
    let keeper: any;
    let foundationWallet: any;
    let normalAccount: any;
    let otherAccounts: any;
    let ct_OJEEStrategyToFarm: any;
    let ct_ERC20TokenFarmPool: any;
    let ct_OJEEVault: any;
    let ct_OJEE: any;
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
        ct_OJEE = await deployOJEE();

        ct_OJEEVault = await deployVault(
            ct_ProxyAdmin,
            ct_OJEE,
            vaultGovernance,
            vaultManagement,
            vaultGuardian,
        );
        ct_ERC20TokenFarmPool = await deployERC20TokenFarmPool(
            ct_ProxyAdmin,
            ct_OJEE,
        );

        ct_OJEEStrategyToFarm = await deployUpgradeableContract(
            "TestOJEEStrategyToFarm",
            ct_ProxyAdmin,
            [ct_OJEEVault.address, ct_ERC20TokenFarmPool.address],
        );
        await ct_OJEEStrategyToFarm.setStrategist(strategistRoler.address);

        await ct_OJEEVault.addStrategy(
            ct_OJEEStrategyToFarm.address,
            10000,
            0,
            MaxUint256,
        );
    }

    async function deployContractsAndInitFixture() {
        await deployContractsFixture();

        await ct_OJEE.approve(ct_OJEEVault.address, MaxUint256);
        await ct_OJEEVault.deposit(VAULT_ASSET, vaultGovernance.address);
        // await ct_OJEE.approve(ct_OJEEStrategyToFarm.address, MaxUint256);
    }

    describe(formatUTPatternTitle("Deployment"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);
        });

        it("Successful: Constructor", async () => {
            expect(await ct_OJEEStrategyToFarm.withdrawalThreshold()).to.equal(
                0,
            );
            expect(await ct_OJEEStrategyToFarm.tokenFarmPool()).to.equal(
                ct_ERC20TokenFarmPool.address,
            );
            expect(await ct_OJEEStrategyToFarm.name()).to.equal(
                "StrategyOJEEFarmPool",
            );
            expect(await ct_OJEEStrategyToFarm.harvestTrigger(0)).to.be.false;
            expect(await ct_OJEEStrategyToFarm.ethToWant(1)).to.be.equal(1);
        });

        it("UnSuccessful: Constructor with no test", async () => {
            let ct_strategy = await deployUpgradeableContract(
                "OJEEStrategyToFarm",
                ct_ProxyAdmin,
                [ct_OJEEVault.address, ct_ERC20TokenFarmPool.address],
            );
            expect(
                await ct_OJEE.allowance(
                    ct_strategy.address,
                    ct_ERC20TokenFarmPool.address,
                ),
            ).to.be.equal(MaxUint256);
        });

        it("Unsuccessful: deployment. \tReason: initialize repeat", async () => {
            await expect(
                ct_OJEEStrategyToFarm.initialize(
                    ct_OJEEVault.address,
                    ct_ERC20TokenFarmPool.address,
                ),
            ).to.be.revertedWith(
                "Initializable: contract is already initialized",
            );
        });

        it("Unsuccessful: deployment. \tReason: initializing", async () => {
            await expect(
                ct_OJEEStrategyToFarm.toInitUnchained(
                    ct_ERC20TokenFarmPool.address,
                ),
            ).to.be.revertedWith("Initializable: contract is not initializing");
            await expect(
                ct_OJEEStrategyToFarm.toInitWithBaseStrategy(
                    ct_OJEEVault.address,
                ),
            ).to.be.revertedWith("Initializable: contract is not initializing");
            await expect(
                ct_OJEEStrategyToFarm.toInitUnchainedWithBaseStrategy(
                    ct_OJEEVault.address,
                ),
            ).to.be.revertedWith("Initializable: contract is not initializing");
        });

        it("Unsuccessful: deployment. \tReason: zero address", async () => {
            await expect(
                ct_OJEEStrategyToFarm.reinitialize(ZeroAddress),
            ).to.be.revertedWith("Invalid zero address");
        });
    });

    describe(formatUTPatternTitle("Authorization functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);
        });

        it("Successful: Called setWithdrawalThreshold function only by authorized", async () => {
            let newValue = 1000;
            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultManagement)
                    .setWithdrawalThreshold(newValue),
            ).to.be.revertedWith("!Authorized");
            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultGuardian)
                    .setWithdrawalThreshold(newValue),
            ).to.be.revertedWith("!Authorized");

            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultGovernance)
                    .setWithdrawalThreshold(newValue),
            ).not.to.be.reverted;
            expect(
                await ct_OJEEStrategyToFarm.withdrawalThreshold(),
            ).to.be.equal(newValue);

            await expect(
                ct_OJEEStrategyToFarm
                    .connect(strategistRoler)
                    .setWithdrawalThreshold(0),
            ).not.to.be.reverted;
            expect(
                await ct_OJEEStrategyToFarm.withdrawalThreshold(),
            ).to.be.equal(0);
        });

        it("Successful: Called setFarmPool function only by authorized", async () => {
            let newValue = otherAccounts[0].address;
            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultManagement)
                    .setFarmPool(newValue),
            ).to.be.revertedWith("!Authorized");
            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultGuardian)
                    .setFarmPool(newValue),
            ).to.be.revertedWith("!Authorized");
            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultGovernance)
                    .setFarmPool(ZeroAddress),
            ).to.be.revertedWith("Invalid zero address");

            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultGovernance)
                    .setFarmPool(newValue),
            ).not.to.be.reverted;
            expect(await ct_OJEEStrategyToFarm.tokenFarmPool()).to.be.equal(
                newValue,
            );
            expect(
                await ct_OJEE.allowance(
                    ct_OJEEStrategyToFarm.address,
                    ct_ERC20TokenFarmPool.address,
                ),
            ).to.be.equal(0);
            expect(
                await ct_OJEE.allowance(
                    ct_OJEEStrategyToFarm.address,
                    newValue,
                ),
            ).to.be.equal(MaxUint256);

            await expect(
                ct_OJEEStrategyToFarm
                    .connect(strategistRoler)
                    .setFarmPool(ct_ERC20TokenFarmPool.address),
            ).not.to.be.reverted;
            expect(await ct_OJEEStrategyToFarm.tokenFarmPool()).to.be.equal(
                ct_ERC20TokenFarmPool.address,
            );
            expect(
                await ct_OJEE.allowance(
                    ct_OJEEStrategyToFarm.address,
                    ct_ERC20TokenFarmPool.address,
                ),
            ).to.be.equal(MaxUint256);
            expect(
                await ct_OJEE.allowance(
                    ct_OJEEStrategyToFarm.address,
                    newValue,
                ),
            ).to.be.equal(0);
        });

        it("Successful: Called sweep function only by governance", async () => {
            let ct_newToken = await deployTestToken(normalAccount);
            let amount = 10000;
            await ct_newToken
                .connect(normalAccount)
                .transfer(ct_OJEEStrategyToFarm.address, amount);

            expect(
                await ct_newToken.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(amount);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(0);

            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultManagement)
                    .sweep(ct_newToken.address),
            ).to.be.revertedWith("!Governance");

            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultGuardian)
                    .sweep(ct_newToken.address),
            ).to.be.revertedWith("!Governance");

            await expect(
                ct_OJEEStrategyToFarm
                    .connect(strategistRoler)
                    .sweep(ct_newToken.address),
            ).to.be.revertedWith("!Governance");

            await expect(
                ct_OJEEStrategyToFarm
                    .connect(vaultGovernance)
                    .sweep(ct_newToken.address),
            ).not.to.be.reverted;

            expect(
                await ct_newToken.balanceOf(ct_OJEEStrategyToFarm.address),
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
            let harvetTime = 0;
            let timeGap = 0;

            expect(await ct_OJEEStrategyToFarm.estimatedAPR()).to.be.equal(0);

            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0)
                .and.to.emit(ct_OJEEVault, "StrategyReported")
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
            let data =
                await ct_OJEEStrategyToFarm.strategyBalanceAndRewardInPool();
            expect(data[0]).to.be.equal(totalAsset);

            // change debtRatio to 50%
            let eventHarvestedData_50_profit: any;
            let totalDebt_50: any = totalAsset.div(2);
            await ct_OJEEVault.updateStrategyDebtRatio(
                ct_OJEEStrategyToFarm.address,
                5000,
            );
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(
                    function (profit: number) {
                        eventHarvestedData_50_profit = profit;
                        return profit > 0;
                    },
                    0,
                    totalAsset.div(2),
                    0,
                )
                .to.be.emit(ct_OJEEVault, "StrategyReported")
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
            timeGap = (await getBlockTime()) - harvetTime;
            harvetTime += timeGap;
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1)),
            ).to.be.equal(eventHarvestedData_50_profit);
            let totalAsset_after50 = totalAsset.add(
                eventHarvestedData_50_profit,
            );
            expect(await ct_OJEEVault.totalAssets()).to.be.equal(
                totalAsset_after50,
            );
            expect(await ct_OJEEStrategyToFarm.estimatedAPR()).to.be.above(0);

            // change back to 100%.
            let eventHarvestedData_back100_profit: any;
            await ct_OJEEVault.updateStrategyDebtRatio(
                ct_OJEEStrategyToFarm.address,
                10000,
            );
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(
                    function (profit: number) {
                        eventHarvestedData_back100_profit = profit;
                        return profit > 0;
                    },
                    0,
                    0,
                    0,
                )
                .to.be.emit(ct_OJEEVault, "StrategyReported")
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
            timeGap = (await getBlockTime()) - harvetTime;
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalDebt_50)
                    .div(x18(1)),
            ).to.be.equal(eventHarvestedData_back100_profit);
            expect(await ct_OJEEVault.totalAssets()).to.be.equal(
                totalAsset_after50.add(eventHarvestedData_back100_profit),
            );
        });

        it("Successful: Called withdrawSome function", async () => {
            let totalAsset = VAULT_ASSET;
            let harvetTime = 0;
            let timeGap = 0;
            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0);
            harvetTime = await getBlockTime();

            // withdraw amount < withdrawalThreshold, withdrawSome, return 0.
            let withdrawAmount: any = totalAsset.div(2);
            let poolAsset: any = 0;
            await ct_OJEEStrategyToFarm.setWithdrawalThreshold(
                withdrawAmount.add(1),
            );
            await expect(ct_OJEEStrategyToFarm.withdrawSome(withdrawAmount))
                .to.emit(ct_OJEEStrategyToFarm, "EventWithdrawSome")
                .withArgs(0);
            timeGap = (await getBlockTime()) - harvetTime;
            poolAsset = await ct_ERC20TokenFarmPool.totalAsset(
                ct_OJEEStrategyToFarm.address,
            );
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(totalAsset),
            ).to.be.equal(poolAsset);

            // withdraw amount >= withdrawalThreshold, withdrawSome, return withdraw amount.
            await ct_OJEEStrategyToFarm.setWithdrawalThreshold(withdrawAmount);
            await expect(ct_OJEEStrategyToFarm.withdrawSome(withdrawAmount))
                .to.emit(ct_OJEEStrategyToFarm, "EventWithdrawSome")
                .withArgs(withdrawAmount);
            timeGap = (await getBlockTime()) - harvetTime;
            poolAsset = await ct_ERC20TokenFarmPool.totalAsset(
                ct_OJEEStrategyToFarm.address,
            );
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(totalAsset)
                    .sub(withdrawAmount),
            ).to.be.equal(poolAsset);
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(withdrawAmount);
        });

        it("Successful: Called withdrawAll function", async () => {
            let totalAsset = VAULT_ASSET;
            let harvetTime = 0;
            let timeGap = 0;
            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0);
            harvetTime = await getBlockTime();

            // withdraw all.
            let poolAsset: any = 0;
            await expect(ct_OJEEStrategyToFarm.withdrawAll())
                .to.emit(ct_OJEEStrategyToFarm, "EventWithdrawAll")
                .withArgs(function (amount: any) {
                    poolAsset = amount;
                    return true;
                });
            timeGap = (await getBlockTime()) - harvetTime;
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(totalAsset),
            ).to.be.equal(poolAsset);
            expect(
                await ct_ERC20TokenFarmPool.totalAsset(
                    ct_OJEEStrategyToFarm.address,
                ),
            ).to.be.equal(0);
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(poolAsset);
        });

        it("Successful: Called adjustPosition function", async () => {
            let totalAsset = VAULT_ASSET;
            let harvetTime = 0;
            let timeGap = 0;
            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0);
            harvetTime = await getBlockTime();

            // withdraw all.
            let poolAsset: any = 0;
            await expect(ct_OJEEStrategyToFarm.withdrawAll())
                .to.emit(ct_OJEEStrategyToFarm, "EventWithdrawAll")
                .withArgs(function (amount: any) {
                    poolAsset = amount;
                    return true;
                });
            timeGap = (await getBlockTime()) - harvetTime;
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(totalAsset),
            ).to.be.equal(poolAsset);
            expect(
                await ct_ERC20TokenFarmPool.totalAsset(
                    ct_OJEEStrategyToFarm.address,
                ),
            ).to.be.equal(0);
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(poolAsset);
            let snapshot = await takeSnapshot();

            // adjustPosition.
            await expect(ct_OJEEStrategyToFarm.adjustPosition(0))
                .to.emit(ct_OJEEStrategyToFarm, "EventAdjustPosition")
                .withArgs(0, poolAsset);
            await snapshot.restore();
            // adjustPosition after emergencyExit.
            await ct_OJEEStrategyToFarm.setEmergencyExit();
            await expect(ct_OJEEStrategyToFarm.adjustPosition(0))
                .to.emit(ct_OJEEStrategyToFarm, "EventAdjustPosition")
                .withArgs(poolAsset, 0);
        });

        it("Successful: Called liquidatePosition function", async () => {
            let totalAsset = VAULT_ASSET;
            let harvetTime = 0;
            let opTime = 0;
            let timeGap = 0;
            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0);
            harvetTime = await getBlockTime();
            // withdraw some.
            let withdrawAmount: any = totalAsset.div(2);
            let poolAsset: any = 0;
            await expect(ct_OJEEStrategyToFarm.withdrawSome(withdrawAmount))
                .to.emit(ct_OJEEStrategyToFarm, "EventWithdrawSome")
                .withArgs(withdrawAmount);
            timeGap = (await getBlockTime()) - harvetTime;
            opTime = harvetTime + timeGap;
            poolAsset = await ct_ERC20TokenFarmPool.totalAsset(
                ct_OJEEStrategyToFarm.address,
            );
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(totalAsset)
                    .sub(withdrawAmount),
            ).to.be.equal(poolAsset);
            let poolBalance = poolAsset;
            expect(
                await ct_ERC20TokenFarmPool.balanceOf(
                    ct_OJEEStrategyToFarm.address,
                ),
            ).to.be.equal(poolBalance);
            let strategyBalance = await ct_OJEE.balanceOf(
                ct_OJEEStrategyToFarm.address,
            );
            expect(strategyBalance).to.be.equal(withdrawAmount);

            // liquidate amount < Strategy Balance.
            // Strategy Balance is no change, because liquidate asset will be transfer to Strategy
            let liquidateAmount = strategyBalance.div(2);
            await expect(
                ct_OJEEStrategyToFarm.liquidatePosition(liquidateAmount),
            )
                .to.emit(ct_OJEEStrategyToFarm, "EventLiquidatePosition")
                .withArgs(liquidateAmount, 0);
            timeGap = (await getBlockTime()) - opTime;
            opTime += timeGap;
            poolAsset = poolAsset.add(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(poolBalance)
                    .div(x18(1)),
            );
            expect(
                await ct_ERC20TokenFarmPool.totalAsset(
                    ct_OJEEStrategyToFarm.address,
                ),
            ).to.be.equal(poolAsset);
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(strategyBalance);

            // Strategy Balance < liquidate amount < Strategy totalDebt, cost Strategy Balance and Pool asset
            liquidateAmount = liquidateAmount.add(strategyBalance);
            await expect(
                ct_OJEEStrategyToFarm.liquidatePosition(liquidateAmount),
            )
                .to.emit(ct_OJEEStrategyToFarm, "EventLiquidatePosition")
                .withArgs(liquidateAmount, 0);
            timeGap = (await getBlockTime()) - opTime;
            opTime += timeGap;
            poolAsset = poolAsset
                .add(
                    ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                        .mul(poolBalance)
                        .div(x18(1)),
                )
                .sub(liquidateAmount.sub(strategyBalance));
            poolBalance = poolAsset;
            expect(
                await ct_ERC20TokenFarmPool.balanceOf(
                    ct_OJEEStrategyToFarm.address,
                ),
            ).to.be.equal(poolBalance);
            expect(
                await ct_ERC20TokenFarmPool.totalAsset(
                    ct_OJEEStrategyToFarm.address,
                ),
            ).to.be.equal(poolAsset);
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(
                strategyBalance.sub(strategyBalance).add(liquidateAmount),
            );
            strategyBalance = liquidateAmount;

            // Strategy totalDebt < liquidate amount, revert
            liquidateAmount = (
                await ct_OJEEStrategyToFarm.estimatedTotalAssets()
            ).mul(2);
            await expect(
                ct_OJEEStrategyToFarm.liquidatePosition(liquidateAmount),
            ).to.be.revertedWith("Balance and reward are not enough");

            // if WithdrawalThreshold > withdraw from tokenFarmPool, liquidate strategyBalance
            await ct_OJEEStrategyToFarm.setWithdrawalThreshold(liquidateAmount);
            await expect(
                ct_OJEEStrategyToFarm.liquidatePosition(liquidateAmount),
            )
                .to.emit(ct_OJEEStrategyToFarm, "EventLiquidatePosition")
                .withArgs(strategyBalance, 0);
        });

        it("Successful: Called liquidateAllPositions function", async () => {
            let totalAsset = VAULT_ASSET;
            let harvetTime = 0;
            let timeGap = 0;
            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0);
            harvetTime = await getBlockTime();

            // withdraw all.
            let poolAsset: any = 0;
            await expect(ct_OJEEStrategyToFarm.liquidateAllPositions())
                .to.emit(ct_OJEEStrategyToFarm, "EventLiquidateAllPositions")
                .withArgs(function (amount: any) {
                    poolAsset = amount;
                    return true;
                });
            timeGap = (await getBlockTime()) - harvetTime;
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(totalAsset),
            ).to.be.equal(poolAsset);
            expect(
                await ct_ERC20TokenFarmPool.totalAsset(
                    ct_OJEEStrategyToFarm.address,
                ),
            ).to.be.equal(0);
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(poolAsset);
        });

        it("Successful: Called prepareReturn function with empty asset", async () => {
            let totalAsset = 0;
            await ct_OJEEVault.withdraw(
                VAULT_ASSET,
                vaultGovernance.address,
                0,
            );

            // Farm pool APR is 0%.
            await ct_ERC20TokenFarmPool.updateRewardAPR(0);

            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0);

            // prepareReturn when debtOutstaning > 0. and profit is 0, loss is 0.
            let debtOutstaning: any = VAULT_ASSET.div(2);
            // if balanceOf(Strategy) == 0, debtPayment == 0.
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(0);
            await expect(ct_OJEEStrategyToFarm.prepareReturn(debtOutstaning))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(0, 0, 0);
            // if balanceOf(Strategy) < debtOutstaning, debtPayment == balanceOf(Strategy).
            let strategyBal: any = debtOutstaning.div(2);
            await ct_OJEE.transfer(ct_OJEEStrategyToFarm.address, strategyBal);
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(strategyBal);
            await expect(ct_OJEEStrategyToFarm.prepareReturn(debtOutstaning))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(0, 0, strategyBal);
            // if balanceOf(Strategy) > debtOutstaning, debtPayment == debtOutstaning.
            await ct_OJEE.transfer(
                ct_OJEEStrategyToFarm.address,
                debtOutstaning.sub(strategyBal).add(10),
            );
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.above(debtOutstaning);
            await expect(ct_OJEEStrategyToFarm.prepareReturn(debtOutstaning))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(0, 0, debtOutstaning);
        });

        it("Successful: Called prepareReturn function", async () => {
            let totalAsset = VAULT_ASSET;

            // Farm pool APR is 0%.
            await ct_ERC20TokenFarmPool.updateRewardAPR(0);

            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0);

            // prepareReturn. debtOutstaning is 0. and profit is 0, loss is 0.
            await expect(ct_OJEEStrategyToFarm.prepareReturn(0))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(0, 0, 0);
            expect(
                await ct_ERC20TokenFarmPool.totalAsset(
                    ct_OJEEStrategyToFarm.address,
                ),
            ).to.be.equal(totalAsset);
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(0);

            // profit > 0
            let harvetTime = 0;
            let timeGap = 0;
            let opTime = 0;
            await ct_OJEEStrategyToFarm.adjustPosition(0);
            await ct_ERC20TokenFarmPool.updateRewardAPR(
                ERC20TokenFarmPool_REWARD_APR,
            );
            harvetTime = await getBlockTime();
            // debtOutstaning == 0, balanceOf(Strategy) == profit
            let profit = 0;
            await expect(ct_OJEEStrategyToFarm.prepareReturn(0))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(
                    function (amount: any) {
                        profit = amount;
                        return amount > 0;
                    },
                    0,
                    0,
                );
            timeGap = (await getBlockTime()) - harvetTime;
            opTime = harvetTime + timeGap;
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1)),
            ).to.be.equal(profit);
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(profit);
            // 0 < debtOutstaning < PoolAsset, balanceOf(Strategy) == profit + debtOutstaning
            let newProfit = 0;
            let debtOutstaning = totalAsset.div(2);
            await expect(ct_OJEEStrategyToFarm.prepareReturn(debtOutstaning))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(
                    function (amount: any) {
                        newProfit = amount;
                        return amount > 0;
                    },
                    0,
                    debtOutstaning,
                );
            timeGap = (await getBlockTime()) - opTime;
            opTime += timeGap;
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1))
                    .add(profit),
            ).to.be.equal(newProfit);
            let strategyBalance = toBig(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            );
            expect(strategyBalance).to.be.equal(debtOutstaning.add(newProfit));
            let poolAsset: any = totalAsset.sub(debtOutstaning);
            profit = newProfit;

            // debtOutstaning > PoolAsset, balanceOf(Strategy) == profit + totalAsset
            debtOutstaning = totalAsset.mul(2);
            await expect(
                ct_OJEEStrategyToFarm.prepareReturn(debtOutstaning),
            ).to.be.revertedWith("Balance and reward are not enough");

            // newLoose < amountToFree
            await ct_OJEEStrategyToFarm.setWithdrawalThreshold(debtOutstaning);
            let snapshot = await takeSnapshot();

            // profit_ < newLoose_
            let newDebtPayment = 0;
            let reward = 0;
            await expect(ct_OJEEStrategyToFarm.prepareReturn(debtOutstaning))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(
                    function (amount: any) {
                        newProfit = amount;
                        return amount > 0;
                    },
                    0,
                    function (amount: any) {
                        newDebtPayment = amount;
                        return amount > 0;
                    },
                )
                .and.to.emit(ct_ERC20TokenFarmPool, "EventWithdrawReward")
                .withArgs(
                    anyValue,
                    function (amount: any) {
                        reward = amount;
                        return amount > 0;
                    },
                    anyValue,
                    anyValue,
                );
            expect(newDebtPayment).to.be.equal(
                strategyBalance.add(reward).sub(newProfit),
            );

            snapshot.restore();
            // profit_ > newLoose_
            await expect(ct_OJEEStrategyToFarm.adjustPosition(0));
            reward = 0;
            await expect(
                ct_OJEEStrategyToFarm.prepareReturn(debtOutstaning.div(2)),
            )
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(
                    function (amount: any) {
                        newProfit = amount;
                        return amount > 0;
                    },
                    0,
                    0,
                )
                .and.to.emit(ct_ERC20TokenFarmPool, "EventWithdrawReward")
                .withArgs(
                    anyValue,
                    function (amount: any) {
                        reward = amount;
                        return amount > 0;
                    },
                    anyValue,
                    anyValue,
                );
            expect(newProfit).to.be.equal(reward);
        });

        it("Successful: Called prepareReturn function with loss", async () => {
            let totalAsset = VAULT_ASSET;

            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0);

            // simulate loss
            let loss = totalAsset.div(10);
            await ct_ERC20TokenFarmPool.takeFunds(
                ct_OJEEStrategyToFarm.address,
                loss,
            );

            let debtOutstaning = totalAsset.mul(2);

            // newLoose < amountToFree
            await ct_OJEEStrategyToFarm.setWithdrawalThreshold(
                debtOutstaning.add(1),
            );
            let snapshot = await takeSnapshot();

            // strategy balance
            let balance = loss.div(4).mul(3);
            loss = loss.div(4);
            await ct_OJEE.transfer(ct_OJEEStrategyToFarm.address, balance);

            // loss < newLoose_
            let newDebtPayment = 0;
            let newLoss = 0;
            let reward = 0;
            await expect(ct_OJEEStrategyToFarm.prepareReturn(debtOutstaning))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(
                    0,
                    function (amount: any) {
                        newLoss = amount;
                        return amount > 0;
                    },
                    function (amount: any) {
                        newDebtPayment = amount;
                        return true;
                    },
                )
                .and.to.emit(ct_ERC20TokenFarmPool, "EventWithdrawReward")
                .withArgs(
                    anyValue,
                    function (amount: any) {
                        reward = amount;
                        return amount > 0;
                    },
                    anyValue,
                    anyValue,
                );
            expect(newLoss).to.be.closeTo(loss.sub(reward), 2);
            expect(balance.add(reward).sub(newLoss)).to.be.closeTo(
                newDebtPayment,
                10,
            );

            await snapshot.restore();
            // loss > newLoose_
            await expect(ct_OJEEStrategyToFarm.adjustPosition(0));
            reward = 0;
            await expect(
                ct_OJEEStrategyToFarm.prepareReturn(debtOutstaning.div(2)),
            )
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(
                    0,
                    function (amount: any) {
                        newLoss = amount;
                        return amount > 0;
                    },
                    0,
                )
                .and.to.emit(ct_ERC20TokenFarmPool, "EventWithdrawReward")
                .withArgs(
                    anyValue,
                    function (amount: any) {
                        reward = amount;
                        return amount > 0;
                    },
                    anyValue,
                    anyValue,
                );
            expect(newLoss).to.be.equal(reward);

            // newLoose >= amountToFree
            await snapshot.restore();
            await ct_OJEEStrategyToFarm.setWithdrawalThreshold(0);
            await expect(ct_OJEEStrategyToFarm.prepareReturn(100))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareReturn")
                .withArgs(
                    0,
                    function (amount: any) {
                        newLoss = amount;
                        return amount > 0;
                    },
                    100,
                );
        });

        it("Successful: Called prepareMigration function", async () => {
            let totalAsset = VAULT_ASSET;
            let harvetTime = 0;
            let timeGap = 0;
            let opTime = 0;

            // first harvest, 100% debtRatio
            await expect(ct_OJEEStrategyToFarm.harvest())
                .to.emit(ct_OJEEStrategyToFarm, "Harvested")
                .withArgs(0, 0, 0, 0);
            harvetTime = await getBlockTime();

            let migrationAsset: any = 0;
            let totalDebt = (
                await ct_OJEEVault.strategies(ct_OJEEStrategyToFarm.address)
            ).totalDebt;
            await expect(ct_OJEEStrategyToFarm.prepareMigration(ZeroAddress))
                .to.emit(ct_OJEEStrategyToFarm, "EventPrepareMigration")
                .withArgs(function (amount: any) {
                    migrationAsset = amount;
                    return amount > totalDebt;
                });
            timeGap = (await getBlockTime()) - harvetTime;
            expect(
                ERC20TokenFarmPool_PERSECOND_RATE.mul(timeGap)
                    .mul(totalAsset)
                    .div(x18(1)),
            ).to.be.equal(migrationAsset.sub(totalDebt));
            expect(
                await ct_OJEE.balanceOf(ct_OJEEStrategyToFarm.address),
            ).to.be.equal(migrationAsset);
        });
    });
});
