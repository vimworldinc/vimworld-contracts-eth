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
    x18,
    mineIncreasedTime,
    MaxUint256,
    checkPermissionFunctionWithCustomError,
    checkPermissionFunctionWithMsg,
    ZeroAddress,
    x_n,
    toBig,
    mineToTheTimeBlock,
} from "../utils";
import {
    deployProxyAdmin,
    deployTestStrategy,
    deployVault,
    deployCommonHealthCheck,
    deployTestToken,
} from "../contractHelpers";

describe(formatUTContractTitle("BaseStrategy"), function () {
    let VAULT_ASSET = x_n(1000000, 6);
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
    let ct_CommonHealthCheck: any;
    let ct_Strategy: any;
    let ct_ProxyAdmin: any;
    let ct_Token: any;

    beforeEach(async () => {
        otherAccounts = await ethers.getSigners();
        owner = otherAccounts.shift();
        vaultGovernance = owner;
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
        ct_Token = await deployTestToken(owner);

        ct_Vault = await deployVault(
            ct_ProxyAdmin,
            ct_Token,
            vaultGovernance,
            vaultGuardian,
            vaultManagement,
        );

        ct_CommonHealthCheck = await deployCommonHealthCheck();

        ct_Strategy = await deployTestStrategy(ct_ProxyAdmin, ct_Vault);
        await ct_Vault.addStrategy(ct_Strategy.address, 10000, 0, MaxUint256);
    }

    async function deployContractsAndInitFixture() {
        await deployContractsFixture();

        await ct_Strategy
            .connect(vaultGovernance)
            .setStrategist(strategistRoler.address);
        await ct_Strategy
            .connect(vaultGovernance)
            .setKeeper(keeperRoler.address);

        await ct_Token.approve(ct_Vault.address, MaxUint256);
        await ct_Vault.deposit(VAULT_ASSET, vaultGovernance.address);
    }

    describe(formatUTPatternTitle("Deployment"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);
        });

        it("Successful: Constructor", async () => {
            expect(await ct_Strategy.strategist()).to.equal(owner.address);
            expect(await ct_Strategy.keeper()).to.equal(owner.address);
            expect(await ct_Strategy.want()).to.equal(ct_Token.address);
            expect(await ct_Strategy.vault()).to.equal(ct_Vault.address);
            expect(await ct_Strategy.name()).to.equal("TestStrategy 0.0.1");
            expect(await ct_Strategy.metadataURI()).to.equal("");
            expect(await ct_Strategy.doHealthCheck()).to.equal(false);
            expect(await ct_Strategy.healthCheck()).to.equal(ZeroAddress);

            expect(await ct_Strategy.minReportDelay()).to.equal(0);
            expect(await ct_Strategy.maxReportDelay()).to.equal(30 * 86400);
            expect(await ct_Strategy.profitFactor()).to.equal(100);
            expect(await ct_Strategy.debtThreshold()).to.equal(0);

            expect(await ct_Strategy.delegatedAssets()).to.equal(0);
            expect(await ct_Strategy.emergencyExit()).to.be.false;
            // Should not trigger until it is approved
            expect(await ct_Strategy.harvestTrigger(0)).to.be.false;
            expect(await ct_Strategy.tendTrigger(0)).to.be.false;
        });

        it("Unsuccessful: deployment. \tReason: already initialized", async () => {
            await expect(
                ct_Strategy.reinitialize(ct_Vault.address),
            ).to.be.revertedWithCustomError(
                ct_Strategy,
                "ErrorStrategyAlreadyInitialized",
            );
        });

        it("Unsuccessful: deployment. \tReason: zero address", async () => {
            await expect(
                ct_Strategy.reinitialize(ZeroAddress),
            ).to.be.revertedWithCustomError(
                ct_Strategy,
                "ErrorVaultZeroAddress",
            );
        });
    });

    describe(formatUTPatternTitle("Authorization functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);

            await ct_Strategy
                .connect(vaultGovernance)
                .setStrategist(strategistRoler.address);
            await ct_Strategy
                .connect(vaultGovernance)
                .setKeeper(keeperRoler.address);
        });

        it("Successful: test function setParams only by permission", async () => {
            // onlyVaultManagers
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement],
                [vaultGuardian, strategistRoler, normalAccount],
                "ErrorNotVaultManager",
                ct_Strategy,
                "setHealthCheck",
                ZeroAddress,
            );
            // onlyVaultManagers
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement],
                [vaultGuardian, strategistRoler, normalAccount],
                "ErrorNotVaultManager",
                ct_Strategy,
                "setDoHealthCheck",
                true,
            );

            // onlyAuthorized
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian, keeperRoler],
                "ErrorNotAuthorized",
                ct_Strategy,
                "setStrategist",
                strategistRoler.address,
            );
            // onlyAuthorized
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian, keeperRoler],
                "ErrorNotAuthorized",
                ct_Strategy,
                "setKeeper",
                keeperRoler.address,
            );

            // onlyAuthorized
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian, keeperRoler],
                "ErrorNotAuthorized",
                ct_Strategy,
                "setMinReportDelay",
                0,
            );
            // onlyAuthorized
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian, keeperRoler],
                "ErrorNotAuthorized",
                ct_Strategy,
                "setMaxReportDelay",
                0,
            );
            // onlyAuthorized
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian, keeperRoler],
                "ErrorNotAuthorized",
                ct_Strategy,
                "setProfitFactor",
                0,
            );
            // onlyAuthorized
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian, keeperRoler],
                "ErrorNotAuthorized",
                ct_Strategy,
                "setDebtThreshold",
                0,
            );
            // onlyAuthorized
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, strategistRoler],
                [vaultManagement, vaultGuardian, keeperRoler],
                "ErrorNotAuthorized",
                ct_Strategy,
                "setMetadataURI",
                "",
            );
            // onlyStrategist
            await checkPermissionFunctionWithCustomError(
                [strategistRoler],
                [
                    vaultGovernance,
                    vaultManagement,
                    vaultGuardian,
                    normalAccount,
                ],
                "ErrorNotStrategist",
                ct_Strategy,
                "testOnlyStrategy",
            );

            // onlyKeeper
            await checkPermissionFunctionWithCustomError(
                [
                    vaultGovernance,
                    vaultManagement,
                    vaultGuardian,
                    strategistRoler,
                    keeperRoler,
                ],
                [normalAccount],
                "ErrorNotKeeper",
                ct_Strategy,
                "harvest",
            );

            // onlyKeeper
            await checkPermissionFunctionWithCustomError(
                [
                    vaultGovernance,
                    vaultManagement,
                    vaultGuardian,
                    strategistRoler,
                    keeperRoler,
                ],
                [normalAccount],
                "ErrorNotKeeper",
                ct_Strategy,
                "tend",
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
                ct_Strategy,
                "setEmergencyExit",
            );
        });

        it("Unsuccessful: Called setStrategist/setKeeper function. \tReason: zero address", async () => {
            await expect(
                ct_Strategy.connect(vaultGovernance).setStrategist(ZeroAddress),
            ).to.be.revertedWithCustomError(
                ct_Strategy,
                "ErrorStrategyZeroAddress",
            );
            await expect(
                ct_Strategy.connect(vaultGovernance).setKeeper(ZeroAddress),
            ).to.be.revertedWithCustomError(
                ct_Strategy,
                "ErrorKeeperZeroAddress",
            );
        });

        it("Successful: Called sweep function only by governance", async () => {
            let ct_newToken = await deployTestToken(normalAccount);
            let amount = 10000;
            await ct_newToken
                .connect(normalAccount)
                .transfer(ct_Strategy.address, amount);

            expect(
                await ct_newToken.balanceOf(ct_Strategy.address),
            ).to.be.equal(amount);

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
                ct_Strategy,
                "sweep",
                ct_newToken.address,
            );

            await expect(
                ct_Strategy.connect(vaultGovernance).sweep(ct_newToken.address),
            ).not.to.be.reverted;

            expect(
                await ct_newToken.balanceOf(ct_Strategy.address),
            ).to.be.equal(0);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(amount);
        });

        it("Unsuccessful: Called sweep. \tReason: token is want", async () => {
            await expect(
                ct_Strategy.connect(vaultGovernance).sweep(ct_Token.address),
            ).to.be.revertedWithCustomError(ct_Strategy, "ErrorShouldNotWant");
        });

        it("Unsuccessful: Called sweep. \tReason: token is share", async () => {
            await expect(
                ct_Strategy.connect(vaultGovernance).sweep(ct_Vault.address),
            ).to.be.revertedWithCustomError(ct_Strategy, "ErrorShouldNotVault");
        });
    });

    describe(formatUTPatternTitle("Logic functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsAndInitFixture);
        });

        it("Successful: test good migration", async () => {
            let totalAsset = VAULT_ASSET;

            // First harvest, call this once to seed the strategy with debt
            await expect(ct_Strategy.harvest()).not.to.be.reverted;

            await mineIncreasedTime(86400);

            let strategy_debt = (await ct_Vault.strategies(ct_Strategy.address))
                .totalDebt;
            expect(strategy_debt).to.be.equal(
                await ct_Token.balanceOf(ct_Strategy.address),
            );

            // new strategy
            let ct_new_Strategy = await deployTestStrategy(
                ct_ProxyAdmin,
                ct_Vault,
            );
            expect(
                (await ct_Vault.strategies(ct_new_Strategy.address)).totalDebt,
            ).to.be.equal(0);
            expect(
                await ct_Token.balanceOf(ct_new_Strategy.address),
            ).to.be.equal(0);

            // Only Governance can migrate
            await checkPermissionFunctionWithMsg(
                [vaultGovernance],
                [
                    vaultManagement,
                    vaultGuardian,
                    strategistRoler,
                    normalAccount,
                ],
                "!Governance",
                ct_Vault,
                "migrateStrategy",
                ct_Strategy.address,
                ct_new_Strategy.address,
            );
            await ct_Vault.migrateStrategy(
                ct_Strategy.address,
                ct_new_Strategy.address,
            );

            expect((await ct_Vault.strategies(ct_Strategy.address)).totalDebt)
                .to.be.equal(await ct_Token.balanceOf(ct_Strategy.address))
                .and.to.be.equal(0);
            expect(
                (await ct_Vault.strategies(ct_new_Strategy.address)).totalDebt,
            )
                .to.be.equal(await ct_Token.balanceOf(ct_new_Strategy.address))
                .and.to.be.equal(strategy_debt);
        });

        it("Successful: test bad migration", async () => {
            // Can't migrate to a strategy with a different vault
            let other_Vault = await deployVault(
                ct_ProxyAdmin,
                ct_Token,
                vaultGovernance,
                vaultGuardian,
                vaultManagement,
            );

            let other_Strategy = await deployTestStrategy(
                ct_ProxyAdmin,
                other_Vault,
            );
            await other_Vault.addStrategy(
                other_Strategy.address,
                10000,
                0,
                MaxUint256,
            );

            await expect(
                ct_Vault.migrateStrategy(
                    ct_Strategy.address,
                    other_Strategy.address,
                ),
            ).to.be.revertedWithCustomError(
                ct_Strategy,
                "ErrorVaultOfNewStrategyDoesNotMatch",
            );

            // new strategy
            let ct_new_Strategy = await deployTestStrategy(
                ct_ProxyAdmin,
                ct_Vault,
            );

            // Can't migrate if you're not the Vault
            await expect(
                ct_Strategy
                    .connect(vaultGovernance)
                    .migrate(ct_new_Strategy.address),
            ).to.be.revertedWithCustomError(ct_Strategy, "ErrorNotVault");

            // Can't migrate if new strategy is 0x0
            await expect(
                ct_Vault.migrateStrategy(ct_Strategy.address, ZeroAddress),
            ).to.be.revertedWith("Zero address");

            // Can't migrate if strategy is active
            await expect(
                ct_Vault.migrateStrategy(
                    ct_Strategy.address,
                    ct_new_Strategy.address,
                ),
            ).not.to.be.reverted;
            await expect(
                ct_Vault.migrateStrategy(
                    ct_new_Strategy.address,
                    ct_Strategy.address,
                ),
            ).to.be.revertedWith("Active new strategy");
        });

        it("Successful: test migrated strategy can call harvest", async () => {
            // new strategy
            let ct_new_Strategy = await deployTestStrategy(
                ct_ProxyAdmin,
                ct_Vault,
            );

            await expect(
                ct_Vault.migrateStrategy(
                    ct_Strategy.address,
                    ct_new_Strategy.address,
                ),
            ).not.to.be.reverted;
            // send profit to the old strategy
            await ct_Token.transfer(ct_Strategy.address, x18(10));

            expect(
                (await ct_Vault.strategies(ct_new_Strategy.address)).totalGain,
            ).to.be.equal(0);
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            expect(
                (await ct_Vault.strategies(ct_Strategy.address)).totalGain,
            ).to.be.equal(x18(10));

            // But it cannot be added back after migrated
            await expect(
                ct_Vault
                    .connect(vaultGovernance)
                    .updateStrategyDebtRatio(ct_new_Strategy.address, 5_000),
            ).not.to.be.reverted;
            await expect(
                ct_Vault
                    .connect(vaultGovernance)
                    .addStrategy(ct_Strategy.address, 5_000, 0, 1000),
            ).to.be.revertedWith("Strategy is active");
        });

        it("Successful: test emergency shutdown", async () => {
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            // send profit to the strategy
            await ct_Token.transfer(ct_Strategy.address, x18(10));

            expect(await ct_Token.balanceOf(ct_Strategy.address)).to.be.above(
                0,
            );
            expect(await ct_Token.balanceOf(ct_Vault.address)).to.be.equal(0);

            await mineIncreasedTime(3600);

            await expect(
                ct_Vault.connect(vaultGovernance).setEmergencyShutdown(true),
            ).not.to.be.reverted;
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;

            // Make sure we are divesting
            expect(await ct_Token.balanceOf(ct_Strategy.address)).to.be.equal(
                0,
            );

            // All the debt is out of the system now
            expect(await ct_Vault.totalDebt()).to.be.equal(0);
            expect(
                (await ct_Vault.strategies(ct_Strategy.address)).totalDebt,
            ).to.be.equal(0);

            // Do it once more, for good luck (and also coverage)
            await ct_Token.transfer(ct_Strategy.address, x18(1000));
            await mineIncreasedTime(3600);
            await expect(ct_Strategy.connect(keeperRoler).harvest()).not.to.be
                .reverted;

            // Vault didn't lose anything during shutdown
            let strategyReturn = (
                await ct_Vault.strategies(ct_Strategy.address)
            ).totalGain;
            expect(strategyReturn).to.be.above(0);
            expect(await ct_Token.balanceOf(ct_Vault.address)).to.be.equal(
                VAULT_ASSET.add(strategyReturn),
            );
        });

        it("Successful: test emergency exit", async () => {
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;

            expect(await ct_Token.balanceOf(ct_Strategy.address)).to.be.above(
                0,
            );
            expect(await ct_Token.balanceOf(ct_Vault.address)).to.be.equal(0);

            await mineIncreasedTime(3600);

            let snapshot = await takeSnapshot();
            // Emergency exit
            // debtRatio == 0
            await ct_Vault.updateStrategyDebtRatio(ct_Strategy.address, 0);
            expect(await ct_Strategy.isActive()).to.be.true;
            await expect(
                ct_Strategy.connect(vaultGovernance).setEmergencyExit(),
            ).not.to.be.reverted;
            await snapshot.restore();

            // Emergency exit
            await expect(
                ct_Strategy.connect(vaultGovernance).setEmergencyExit(),
            ).not.to.be.reverted;
            snapshot = await takeSnapshot();

            // liquidate amount == debtOutstanding
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            await snapshot.restore();

            // liquidate amount > debtOutstanding
            await ct_Token.transfer(ct_Strategy.address, x18(100));
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            // Make sure we are divesting
            expect(await ct_Token.balanceOf(ct_Strategy.address)).to.be.equal(
                0,
            );

            await snapshot.restore();
            // Loss. There was a hack!
            let stolen_funds = toBig(
                await ct_Token.balanceOf(ct_Strategy.address),
            ).div(10);
            await ct_Strategy.connect(vaultGovernance).takeFunds(stolen_funds);

            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;

            // Make sure we are divesting
            expect(await ct_Token.balanceOf(ct_Strategy.address)).to.be.equal(
                0,
            );

            // All the debt is out of the system now
            expect(await ct_Vault.totalDebt()).to.be.equal(0);
            expect(
                (await ct_Vault.strategies(ct_Strategy.address)).totalDebt,
            ).to.be.equal(0);
            expect(
                (await ct_Vault.strategies(ct_Strategy.address)).totalLoss,
            ).to.be.equal(stolen_funds);

            // Vault returned something overall though
            let strategyReturn = (
                await ct_Vault.strategies(ct_Strategy.address)
            ).totalGain;
            expect(strategyReturn).to.be.equal(0);
            expect(await ct_Token.balanceOf(ct_Vault.address)).to.be.equal(
                VAULT_ASSET.add(strategyReturn).sub(stolen_funds),
            );

            // Can't set shup down
            await expect(
                ct_Vault.updateStrategyDebtRatio(ct_Strategy.address, 1),
            ).to.be.revertedWith("In emergency");
        });

        it("Successful: test strategy harvest with health check", async () => {
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            await expect(
                ct_Strategy
                    .connect(vaultGovernance)
                    .setHealthCheck(ct_CommonHealthCheck.address),
            ).not.to.be.reverted;

            let snapshot = await takeSnapshot();

            // Small gain doesn't trigger
            let balance = await ct_Strategy.estimatedTotalAssets();
            await ct_Token.transfer(
                ct_Strategy.address,
                toBig(balance).div(50),
            );
            await mineIncreasedTime(3600);
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            await snapshot.restore();

            // gain is too big
            balance = await ct_Strategy.estimatedTotalAssets();
            await ct_Token.transfer(
                ct_Strategy.address,
                toBig(balance).div(20),
            );
            await expect(
                ct_Strategy.connect(vaultGovernance).harvest(),
            ).to.be.revertedWithCustomError(ct_Strategy, "ErrorNotHealthCheck");
            await ct_Strategy.connect(vaultGovernance).setDoHealthCheck(false);
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            await snapshot.restore();

            // small loss doesn't trigger
            balance = await ct_Strategy.estimatedTotalAssets();
            await ct_Strategy
                .connect(vaultGovernance)
                .takeFunds(toBig(balance).div(10000));
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            await snapshot.restore();

            // loss is too important
            balance = await ct_Strategy.estimatedTotalAssets();
            await ct_Strategy
                .connect(vaultGovernance)
                .takeFunds(toBig(balance).div(100).mul(3));
            await expect(
                ct_Strategy.connect(vaultGovernance).harvest(),
            ).to.be.revertedWithCustomError(ct_Strategy, "ErrorNotHealthCheck");

            await ct_Strategy.connect(vaultGovernance).setDoHealthCheck(false);
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
        });

        it("Successful: test startup", async () => {
            // Never reported yet (no data points)
            // NOTE: done for coverage
            expect(
                await ct_Vault.expectedReturn(ct_Strategy.address),
            ).to.be.equal(0);

            // Check accounting is maintained everywhere
            expect(await ct_Token.balanceOf(ct_Vault.address)).to.be.above(0);
            expect(await ct_Vault.totalAssets()).to.be.equal(
                await ct_Token.balanceOf(ct_Vault.address),
            );
            expect((await ct_Vault.strategies(ct_Strategy.address)).totalDebt)
                .to.be.equal(await ct_Vault.totalDebt())
                .and.to.be.equal(await ct_Strategy.estimatedTotalAssets())
                .and.to.be.equal(await ct_Token.balanceOf(ct_Strategy.address))
                .and.to.be.equal(0);

            // Take on debt
            await mineIncreasedTime(3600);
            expect(
                await ct_Vault.expectedReturn(ct_Strategy.address),
            ).to.be.equal(0);
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            expect(await ct_Strategy.isActive()).to.be.true;

            // Check balance is increasing
            expect(await ct_Token.balanceOf(ct_Strategy.address)).to.be.above(
                0,
            );
            let balance = await ct_Token.balanceOf(ct_Strategy.address);

            // Check accounting is maintained everywhere
            expect(await ct_Vault.totalAssets()).to.be.equal(
                toBig(await ct_Token.balanceOf(ct_Vault.address)).add(balance),
            );
            expect((await ct_Vault.strategies(ct_Strategy.address)).totalDebt)
                .to.be.equal(await ct_Vault.totalDebt())
                .and.to.be.equal(await ct_Strategy.estimatedTotalAssets())
                .and.to.be.equal(balance);

            // We have 1 data point for E[R] calc w/ no profits, so E[R] = 0
            await mineIncreasedTime(3600);
            expect(
                await ct_Vault.expectedReturn(ct_Strategy.address),
            ).to.be.equal(0);

            let profit = toBig(
                await ct_Token.balanceOf(ct_Strategy.address),
            ).div(50);
            expect(profit).to.be.above(0);
            await ct_Token.transfer(ct_Strategy.address, profit);
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            expect(
                (await ct_Vault.strategies(ct_Strategy.address)).totalGain,
            ).to.be.equal(profit);

            // Check balance is increasing
            let newBalance = await ct_Token.balanceOf(ct_Strategy.address);
            expect(newBalance).to.be.above(0);
            balance = newBalance;

            // Check accounting is maintained everywhere
            expect(await ct_Vault.totalAssets()).to.be.equal(
                toBig(await ct_Token.balanceOf(ct_Vault.address)).add(balance),
            );
            expect((await ct_Vault.strategies(ct_Strategy.address)).totalDebt)
                .to.be.equal(await ct_Vault.totalDebt())
                .and.to.be.equal(await ct_Strategy.estimatedTotalAssets())
                .and.to.be.equal(balance);
        });

        it("Successful: test withdraw", async () => {
            let rando = otherAccounts[0];
            let asset = x18(1000);
            await ct_Token.transfer(normalAccount.address, asset);

            await ct_Token
                .connect(normalAccount)
                .approve(ct_Vault.address, MaxUint256);
            await ct_Vault
                .connect(normalAccount)
                .deposit(asset, normalAccount.address);

            await mineIncreasedTime(3600);
            // Seed some debt in there
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            let balance = toBig(await ct_Strategy.estimatedTotalAssets());
            expect(balance).to.be.above(0);

            let vaultRole = normalAccount;
            await ct_Strategy.setVault(vaultRole.address);
            await ct_Strategy.connect(vaultRole).withdraw(balance.div(2));
            expect(await ct_Strategy.estimatedTotalAssets()).to.be.equal(
                balance.sub(balance.div(2)),
            );

            // Not just anyone can call it
            await expect(
                ct_Strategy.connect(rando).withdraw(balance.div(2)),
            ).to.be.revertedWithCustomError(ct_Strategy, "ErrorNotVault");

            // Anything over what we can liquidate is totally withdrawn
            await expect(
                ct_Strategy.connect(vaultRole).withdraw(balance.div(2)),
            ).not.to.be.reverted;
            expect(await ct_Strategy.estimatedTotalAssets()).to.be.equal(0);
        });

        it("Successful: test harvest tend authority", async () => {
            // Only keeper, strategist, or gov can call tend
            await checkPermissionFunctionWithCustomError(
                [
                    vaultGovernance,
                    vaultManagement,
                    vaultGuardian,
                    strategistRoler,
                    keeperRoler,
                ],
                [normalAccount],
                "ErrorNotKeeper",
                ct_Strategy,
                "tend",
            );

            // Only keeper, strategist, or gov can call harvest
            await checkPermissionFunctionWithCustomError(
                [
                    vaultGovernance,
                    vaultManagement,
                    vaultGuardian,
                    strategistRoler,
                    keeperRoler,
                ],
                [normalAccount],
                "ErrorNotKeeper",
                ct_Strategy,
                "harvest",
            );
        });

        it("Successful: test harvest tend trigger", async () => {
            let _ct_test_Strategy = await deployTestStrategy(
                ct_ProxyAdmin,
                ct_Vault,
            );

            // Trigger doesn't work until strategy is attached and funds added
            expect(await _ct_test_Strategy.harvestTrigger(0)).to.be.false;

            // Must wait at least the minimum amount of time for it to be active
            let last_report = (await ct_Vault.strategies(ct_Strategy.address))
                .lastReport;
            // Sends funds into strategy
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            await ct_Strategy.connect(vaultGovernance).setMinReportDelay(10);
            expect(await ct_Strategy.harvestTrigger(0)).to.be.false;

            await mineIncreasedTime(
                parseInt(toBig(await ct_Strategy.minReportDelay()).toString()),
            );
            let delayEnoughSnapshot = await takeSnapshot();

            // After maxReportDelay has expired,  doesn't matter
            last_report = (await ct_Vault.strategies(ct_Strategy.address))
                .lastReport;
            let newTime = toBig(await ct_Strategy.maxReportDelay()).add(
                last_report,
            );
            await mineToTheTimeBlock(newTime);
            expect(await ct_Strategy.harvestTrigger(MaxUint256)).to.be.true;
            // Resets the reporting
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;

            // harvest if we have any debtoutstanding at all, first add loose want
            await delayEnoughSnapshot.restore();
            expect(await ct_Strategy.harvestTrigger(0)).to.be.false;
            let value = (await ct_Token.balanceOf(vaultGovernance.address)).div(
                20,
            );
            await ct_Token.approve(ct_Vault.address, value);
            await ct_Vault.updateStrategyDebtRatio(ct_Strategy.address, 0);
            await ct_Strategy.connect(vaultGovernance).setDebtThreshold(1);
            expect(await ct_Strategy.harvestTrigger(0)).to.be.true;

            // harvest if we have any loss
            await delayEnoughSnapshot.restore();
            await ct_Strategy.takeFunds(100);
            expect(await ct_Strategy.harvestTrigger(0)).to.be.true;

            // Resets the reporting
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;

            // harvest if we have any credit and profit at all, first add loose want
            await delayEnoughSnapshot.restore();
            expect(await ct_Strategy.harvestTrigger(0)).to.be.false;
            expect(await ct_Strategy.estimatedProfit()).to.be.equal(0);
            expect(
                await ct_Vault.creditAvailable(ct_Strategy.address),
            ).to.be.equal(0);
            let callCost_ = toBig(100);
            let profitFactor = await ct_Strategy.profitFactor();
            let gasThreshold = callCost_.mul(profitFactor);
            let theSnapshot = await takeSnapshot();
            // add credit
            await ct_Vault.deposit(gasThreshold, vaultGovernance.address);
            expect(
                await ct_Vault.creditAvailable(ct_Strategy.address),
            ).to.be.equal(gasThreshold);
            expect(await ct_Strategy.harvestTrigger(callCost_)).to.be.false;
            await ct_Vault.deposit(1, vaultGovernance.address);
            expect(
                await ct_Vault.creditAvailable(ct_Strategy.address),
            ).to.be.equal(gasThreshold.add(1));
            expect(await ct_Strategy.harvestTrigger(callCost_)).to.be.true;
            await theSnapshot.restore();
            // add profit
            await ct_Token.transfer(ct_Strategy.address, gasThreshold);
            expect(await ct_Strategy.estimatedProfit()).to.be.equal(
                gasThreshold,
            );
            expect(await ct_Strategy.harvestTrigger(callCost_)).to.be.false;
            await ct_Token.transfer(ct_Strategy.address, 1);
            expect(await ct_Strategy.estimatedProfit()).to.be.equal(
                gasThreshold.add(1),
            );
            expect(await ct_Strategy.harvestTrigger(callCost_)).to.be.true;
            await theSnapshot.restore();
            // add credit and profit
            await ct_Vault.deposit(gasThreshold, vaultGovernance.address);
            expect(
                await ct_Vault.creditAvailable(ct_Strategy.address),
            ).to.be.equal(gasThreshold);
            expect(await ct_Strategy.harvestTrigger(callCost_)).to.be.false;
            await ct_Token.transfer(ct_Strategy.address, 1);
            expect(await ct_Strategy.estimatedProfit()).to.be.equal(1);
            expect(await ct_Strategy.harvestTrigger(callCost_)).to.be.true;

            // Check that trigger works in emergency exit mode, no change.
            await delayEnoughSnapshot.restore();
            await ct_Strategy.connect(vaultGovernance).setEmergencyExit();
            expect(
                await ct_Vault.debtOutstanding(ct_Strategy.address),
            ).to.be.above(await ct_Strategy.debtThreshold());
            expect(await ct_Strategy.harvestTrigger(0)).to.be.true;
        });

        it("Successful: test reduce debt ratio", async () => {
            await expect(ct_Strategy.connect(vaultGovernance).harvest()).not.to
                .be.reverted;
            expect(
                (await ct_Vault.strategies(ct_Strategy.address)).totalDebt,
            ).to.be.above(0);
            let old_debt_ratio = (
                await ct_Vault.strategies(ct_Strategy.address)
            ).debtRatio;
            await ct_Vault.updateStrategyDebtRatio(
                ct_Strategy.address,
                toBig(old_debt_ratio).div(2),
            );

            expect(
                await ct_Vault.debtOutstanding(ct_Strategy.address),
            ).to.be.above(0);
        });
    });
});
