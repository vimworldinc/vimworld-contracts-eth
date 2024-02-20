import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import {
    formatUTContractTitle,
    formatUTPatternTitle,
    x18,
    MaxUint256,
    checkPermissionFunctionWithCustomError,
    anyValue,
    ZeroAddress,
    toBig,
    x_n,
    deployContract,
    failurePermissionFunctionWithMsg,
} from "../utils";
import {
    deployProxyAdmin,
    deployVault,
    deployWETH,
    deployTestGenericAaveV3,
    deployTestToken,
    deployTokens,
    deployUSDTStrategyToLender,
    deployTestAave,
} from "../contractHelpers";

import {
    AAVE_APR,
    Ethereum_PROTOCOL_DATA_PROVIDER,
    Ethereum_StETH,
} from "../contractsConfig";

describe(formatUTContractTitle("GenericAaveV3"), function () {
    let vaultGovernance: any;
    let vaultManagement: any;
    let vaultGuardian: any;
    let ct_Strategy_role: any;
    let rewardRoler: any;
    let owner: any;
    let adminRoler;
    let minter;
    let manager;
    let normalAccount: any;
    let otherAccounts: any[];
    let ct_Vault: any;
    let ct_AToken: any;
    let ct_GenericAaveV3: any;
    let ct_USDTStrategyToLender: any;
    let ct_ProxyAdmin: any;
    let ct_USDT: any;
    let ct_TestProtocolDataPrivider: any;
    let ct_TestAavePool: any;
    let ContractsDict: any;

    beforeEach(async () => {
        otherAccounts = await ethers.getSigners();
        vaultGovernance = otherAccounts.shift();
        owner = vaultGovernance;
        vaultManagement = otherAccounts.shift();
        vaultGuardian = otherAccounts.shift();
        ct_Strategy_role = otherAccounts.shift();
        rewardRoler = otherAccounts.shift();
        adminRoler = otherAccounts.shift();
        minter = otherAccounts.shift();
        manager = otherAccounts.shift();
        normalAccount = otherAccounts.shift();
    });

    async function deployContractsFixture() {
        ct_ProxyAdmin = await deployProxyAdmin();
        ContractsDict = await deployTokens();
        ct_USDT = ContractsDict.USDT;

        ct_Vault = await deployVault(
            ct_ProxyAdmin,
            ct_USDT,
            vaultGovernance,
            vaultGuardian,
            vaultManagement,
        );

        let ct_WETH = await deployWETH();
        ct_USDTStrategyToLender = await deployUSDTStrategyToLender(
            ct_ProxyAdmin,
            ct_Vault,
            ct_WETH,
            ContractsDict.USDT,
        );

        await ct_Vault.addStrategy(
            ct_USDTStrategyToLender.address,
            10000,
            0,
            MaxUint256,
        );

        [ct_TestProtocolDataPrivider, ct_AToken] = await deployTestAave(
            ct_ProxyAdmin,
            ContractsDict.USDT,
        );
        ct_TestAavePool = ct_AToken;
        ct_GenericAaveV3 = await deployTestGenericAaveV3(
            ct_ProxyAdmin,
            ct_USDTStrategyToLender,
            ct_TestProtocolDataPrivider.address,
        );

        await ct_GenericAaveV3.updateStrategy(ct_Strategy_role.address);
    }

    async function deployContractsAndInitFixture() {
        await deployContractsFixture();

        await ct_USDT
            .connect(vaultGovernance)
            .approve(ct_GenericAaveV3.address, MaxUint256);
        let strategy_bal = toBig(
            await ct_USDT.balanceOf(vaultGovernance.address),
        ).div(10);
        await ct_USDT
            .connect(vaultGovernance)
            .transfer(ct_GenericAaveV3.address, strategy_bal);
    }

    describe(formatUTPatternTitle("Deployment"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);
        });

        it("Successful: Constructor", async () => {
            expect(await ct_GenericAaveV3.aToken()).to.equal(ct_AToken.address);
            expect(await ct_GenericAaveV3.vault()).to.equal(ct_Vault.address);
            expect(await ct_GenericAaveV3.strategy()).to.equal(
                ct_Strategy_role.address,
            );
            expect(await ct_GenericAaveV3.want()).to.equal(ct_USDT.address);
            expect(await ct_GenericAaveV3.dust()).to.equal(0);
            expect(await ct_GenericAaveV3.superProtocolDataProvider()).to.equal(
                Ethereum_PROTOCOL_DATA_PROVIDER,
            );
        });

        it("UnSuccessful: Constructor with no test", async () => {
            let ct_impl: any = await deployContract("GenericAaveV3");

            const initEncodedData = ct_impl.interface.encodeFunctionData(
                "initialize",
                [ct_USDTStrategyToLender.address, "AaveV3"],
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
                ct_GenericAaveV3.initialize(
                    ct_USDTStrategyToLender.address,
                    "AaveV3",
                ),
            ).to.be.revertedWith(
                "Initializable: contract is already initialized",
            );
        });

        it("Unsuccessful: deployment. \tReason: initializing", async () => {
            await expect(ct_GenericAaveV3.toInitUnchained()).to.be.revertedWith(
                "Initializable: contract is not initializing",
            );
            await expect(
                ct_GenericAaveV3.toInitWithGenericLenderBase(
                    ct_USDTStrategyToLender.address,
                    "AaveV3",
                ),
            ).to.be.revertedWith("Initializable: contract is not initializing");
            await expect(
                ct_GenericAaveV3.toInitUnchainedWithGenericLenderBase(
                    ct_USDTStrategyToLender.address,
                    "AaveV3",
                ),
            ).to.be.revertedWith("Initializable: contract is not initializing");
        });

        it("Unsuccessful: deployment. \tReason: already initialized", async () => {
            await expect(
                ct_GenericAaveV3.reinitialize(
                    ct_USDTStrategyToLender.address,
                    ct_TestProtocolDataPrivider.address,
                    "AaveV3",
                ),
            ).to.be.revertedWithCustomError(
                ct_GenericAaveV3,
                "ErrorLenderAlreadyInitialized",
            );
            await ct_GenericAaveV3.clearStrategy();
            await expect(
                ct_GenericAaveV3.reinitialize(
                    ct_USDTStrategyToLender.address,
                    ct_TestProtocolDataPrivider.address,
                    "AaveV3",
                ),
            ).to.be.revertedWithCustomError(
                ct_GenericAaveV3,
                "ErrorGenericAaveAlreadyInitialized",
            );
        });

        it("Unsuccessful: deployment. \tReason: zero address", async () => {
            await expect(
                ct_GenericAaveV3.reinitialize(
                    ZeroAddress,
                    ct_TestProtocolDataPrivider.address,
                    "AaveV3",
                ),
            ).to.be.revertedWithCustomError(
                ct_GenericAaveV3,
                "ErrorStrategyZeroAddress",
            );
        });
    });

    describe(formatUTPatternTitle("Authorization functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsFixture);
        });

        it("Successful: test function setParams only by permission", async () => {
            // management
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement, ct_Strategy_role],
                [normalAccount],
                "ErrorNotManagement",
                ct_GenericAaveV3,
                "setDust",
                0,
            );

            // management
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement, ct_Strategy_role],
                [normalAccount],
                "ErrorNotManagement",
                ct_GenericAaveV3,
                "setReferralCode",
                1,
            );

            // onlyGovernance
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance],
                [vaultManagement, ct_Strategy_role, normalAccount],
                "ErrorNotGovernance",
                ct_GenericAaveV3,
                "emergencyWithdraw",
                0,
            );

            // management
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement, ct_Strategy_role],
                [normalAccount],
                "ErrorNotManagement",
                ct_GenericAaveV3,
                "withdrawAll",
            );
        });

        it("Successful: Called sweep function only by governance", async () => {
            let ct_newToken = await deployTestToken(normalAccount);
            let amount = 10000;
            await ct_newToken
                .connect(normalAccount)
                .transfer(ct_GenericAaveV3.address, amount);

            expect(
                await ct_newToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(amount);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(0);

            // management
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement, ct_Strategy_role],
                [normalAccount],
                "ErrorNotManagement",
                ct_GenericAaveV3,
                "sweep",
                ct_newToken.address,
            );

            await expect(
                ct_GenericAaveV3
                    .connect(vaultGovernance)
                    .sweep(ct_newToken.address),
            ).not.to.be.reverted;

            expect(
                await ct_newToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(0);
            expect(
                await ct_newToken.balanceOf(vaultGovernance.address),
            ).to.be.equal(amount);
        });

        it("Unsuccessful: Called sweep. \tReason: token is protected", async () => {
            await expect(
                ct_GenericAaveV3
                    .connect(vaultGovernance)
                    .sweep(ct_USDT.address),
            ).to.be.revertedWithCustomError(
                ct_GenericAaveV3,
                "ErrorShouldNotProtected",
            );
            await expect(
                ct_GenericAaveV3
                    .connect(vaultGovernance)
                    .sweep(ct_AToken.address),
            ).to.be.revertedWithCustomError(
                ct_GenericAaveV3,
                "ErrorShouldNotProtected",
            );
        });

        it("Unsuccessful: Called setReferralCode. \tReason: invalid code", async () => {
            await expect(
                ct_GenericAaveV3.connect(vaultGovernance).setReferralCode(0),
            ).to.be.revertedWithCustomError(
                ct_GenericAaveV3,
                "ErrorInvalidReferralCode",
            );
        });
    });

    describe(formatUTPatternTitle("Logic functions"), function () {
        beforeEach(async () => {
            await loadFixture(deployContractsAndInitFixture);
        });

        it("Successful: Called deposit function", async () => {
            let totalBal = toBig(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            );
            let share = 0;
            // deposit permission, management
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement, ct_Strategy_role],
                [normalAccount],
                "ErrorNotManagement",
                ct_GenericAaveV3,
                "deposit",
            );

            // deposit success
            await ct_GenericAaveV3.connect(vaultGovernance).setReferralCode(1);
            await expect(ct_GenericAaveV3.connect(ct_Strategy_role).deposit())
                .to.emit(ct_TestAavePool, "EventSupply")
                .withArgs(ct_GenericAaveV3.address, totalBal, 1)
                .and.to.emit(ct_TestAavePool, "Transfer")
                .withArgs(ZeroAddress, ct_GenericAaveV3.address, totalBal)
                .and.to.emit(ct_TestAavePool, "TransferShares")
                .withArgs(
                    ZeroAddress,
                    ct_GenericAaveV3.address,
                    function (amount: any) {
                        share = amount;
                        return true;
                    },
                );
            expect(
                await ct_AToken.sharesOf(ct_GenericAaveV3.address),
            ).to.be.equal(share);
            expect(
                await ct_USDT.balanceOf(ct_Strategy_role.address),
            ).to.be.equal(0);
            let genericAaveV3_assetBal = await ct_AToken.balanceOf(
                ct_GenericAaveV3.address,
            );
            expect(
                await ct_AToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(genericAaveV3_assetBal);
            expect(
                await ct_GenericAaveV3.underlyingBalanceStored(),
            ).to.be.equal(genericAaveV3_assetBal);
            expect(await ct_GenericAaveV3.nav()).to.be.equal(
                genericAaveV3_assetBal,
            );
            expect(await ct_GenericAaveV3.hasAssets()).to.be.true;
            let apr = await ct_GenericAaveV3.apr();
            expect(apr).to.be.closeTo(x_n(AAVE_APR, 14), x_n(1, 12));
            expect(await ct_GenericAaveV3.aprAfterDeposit(0)).to.be.equal(apr);
            let weightedApr = await ct_GenericAaveV3.weightedApr();
            expect(genericAaveV3_assetBal.mul(apr)).to.be.equal(weightedApr);
        });

        it("Successful: Called deposit function with zero allowance", async () => {
            await ct_GenericAaveV3.setLpApprove(0);
            let totalBal = toBig(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            );
            let share = 0;
            // deposit
            await expect(ct_GenericAaveV3.connect(ct_Strategy_role).deposit())
                .to.emit(ct_TestAavePool, "EventSupply")
                .withArgs(ct_GenericAaveV3.address, totalBal, 0)
                .and.to.emit(ct_TestAavePool, "Transfer")
                .withArgs(ZeroAddress, ct_GenericAaveV3.address, totalBal)
                .and.to.emit(ct_TestAavePool, "TransferShares")
                .withArgs(
                    ZeroAddress,
                    ct_GenericAaveV3.address,
                    function (amount: any) {
                        share = amount;
                        return true;
                    },
                );
            expect(
                await ct_AToken.sharesOf(ct_GenericAaveV3.address),
            ).to.be.equal(share);
            expect(
                await ct_USDT.balanceOf(ct_Strategy_role.address),
            ).to.be.equal(0);
            let genericAaveV3_assetBal = await ct_AToken.balanceOf(
                ct_GenericAaveV3.address,
            );
            expect(
                await ct_AToken.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(genericAaveV3_assetBal);
            expect(
                await ct_GenericAaveV3.underlyingBalanceStored(),
            ).to.be.equal(genericAaveV3_assetBal);
            expect(await ct_GenericAaveV3.nav()).to.be.equal(
                genericAaveV3_assetBal,
            );
            expect(await ct_GenericAaveV3.hasAssets()).to.be.true;
            let apr = await ct_GenericAaveV3.apr();
            expect(apr).to.be.closeTo(x_n(AAVE_APR, 14), x_n(1, 12));
            expect(await ct_GenericAaveV3.aprAfterDeposit(0)).to.be.equal(apr);
            let weightedApr = await ct_GenericAaveV3.weightedApr();
            expect(genericAaveV3_assetBal.mul(apr)).to.be.equal(weightedApr);
        });

        it("Successful: Called withdraw function", async () => {
            let totalBal = toBig(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            );
            let share = 0;

            // withdraw permission: management
            await checkPermissionFunctionWithCustomError(
                [vaultGovernance, vaultManagement, ct_Strategy_role],
                [normalAccount],
                "ErrorNotManagement",
                ct_GenericAaveV3,
                "withdraw",
                0,
            );

            // deposit
            await expect(ct_GenericAaveV3.connect(ct_Strategy_role).deposit())
                .to.emit(ct_TestAavePool, "TransferShares")
                .withArgs(
                    ZeroAddress,
                    ct_GenericAaveV3.address,
                    function (amount: any) {
                        share = amount;
                        return true;
                    },
                );
            // USDT in GenericAave3 > withdrawAmount
            let withdrawAmount = totalBal.div(2);
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_GenericAaveV3.address, withdrawAmount);

            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(withdrawAmount);

            // withdraw, amount <= usdt balance
            await expect(
                ct_GenericAaveV3
                    .connect(ct_Strategy_role)
                    .withdraw(withdrawAmount),
            )
                .to.emit(ct_USDT, "Transfer")
                .withArgs(
                    ct_GenericAaveV3.address,
                    ct_Strategy_role.address,
                    withdrawAmount,
                );
            expect(
                await ct_AToken.sharesOf(ct_GenericAaveV3.address),
            ).to.be.equal(share);

            // balance of usdt in Aave pool <= dust
            let usdtBal = await ct_USDT.balanceOf(ct_TestAavePool.address);
            await ct_GenericAaveV3.setDust(usdtBal.add(1000));
            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(0);
            await expect(
                ct_GenericAaveV3
                    .connect(ct_Strategy_role)
                    .withdraw(withdrawAmount),
            )
                .to.emit(ct_USDT, "Transfer")
                .withArgs(
                    ct_GenericAaveV3.address,
                    ct_Strategy_role.address,
                    0,
                );

            // dust == 0, balance of usdt in Aave pool < withdrawAmount
            await ct_GenericAaveV3.setDust(0);
            withdrawAmount = totalBal.mul(2);
            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(0);
            expect(
                await ct_USDT.balanceOf(ct_TestAavePool.address),
            ).to.be.below(withdrawAmount);
            let receiveAmount = await ct_USDT.balanceOf(
                ct_TestAavePool.address,
            );
            await expect(
                ct_GenericAaveV3
                    .connect(ct_Strategy_role)
                    .withdraw(withdrawAmount),
            )
                .to.emit(ct_TestAavePool, "EventWithdraw")
                .withArgs(ct_GenericAaveV3.address, anyValue, anyValue)
                .and.to.emit(ct_USDT, "Transfer")
                .withArgs(
                    ct_GenericAaveV3.address,
                    ct_Strategy_role.address,
                    receiveAmount,
                );

            // balance of usdt in Aave pool >= withdrawAmount
            await ct_USDT
                .connect(ct_Strategy_role)
                .transfer(ct_GenericAaveV3.address, receiveAmount);
            await expect(ct_GenericAaveV3.connect(ct_Strategy_role).deposit())
                .not.to.be.reverted;

            usdtBal = await ct_USDT.balanceOf(ct_TestAavePool.address);
            withdrawAmount = toBig(usdtBal).div(2);
            expect(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            ).to.be.equal(0);
            await expect(
                ct_GenericAaveV3
                    .connect(ct_Strategy_role)
                    .withdraw(withdrawAmount),
            )
                .to.emit(ct_TestAavePool, "EventWithdraw")
                .withArgs(ct_GenericAaveV3.address, withdrawAmount, anyValue)
                .and.to.emit(ct_USDT, "Transfer")
                .withArgs(
                    ct_GenericAaveV3.address,
                    ct_Strategy_role.address,
                    withdrawAmount,
                );
        });

        it("Successful: Called emergencyWithdraw function", async () => {
            let totalBal = toBig(
                await ct_USDT.balanceOf(ct_GenericAaveV3.address),
            );
            let share = 0;
            // deposit
            await expect(ct_GenericAaveV3.connect(ct_Strategy_role).deposit())
                .to.emit(ct_TestAavePool, "TransferShares")
                .withArgs(
                    ZeroAddress,
                    ct_GenericAaveV3.address,
                    function (amount: any) {
                        share = amount;
                        return true;
                    },
                );
            let balBefore = await ct_USDT.balanceOf(vaultGovernance.address);
            let withdrawAmount = totalBal.div(2);
            // withdraw
            await expect(
                ct_GenericAaveV3
                    .connect(vaultGovernance)
                    .emergencyWithdraw(withdrawAmount),
            )
                .to.emit(ct_TestAavePool, "EventWithdraw")
                .withArgs(ct_GenericAaveV3.address, withdrawAmount, anyValue)
                .and.to.emit(ct_USDT, "Transfer")
                .withArgs(
                    ct_GenericAaveV3.address,
                    vaultGovernance.address,
                    withdrawAmount,
                );
            let balAfter = await ct_USDT.balanceOf(vaultGovernance.address);
            expect(toBig(balAfter).sub(balBefore)).to.be.equal(withdrawAmount);

            // withdraw all
            await ct_GenericAaveV3.withdrawAll();
            await ct_GenericAaveV3.setDust(x_n(1, 5));
            await ct_USDT
                .connect(vaultGovernance)
                .transfer(ct_GenericAaveV3.address, x_n(1, 6));
            expect(await ct_GenericAaveV3.hasAssets()).to.be.true;
        });
    });
});
