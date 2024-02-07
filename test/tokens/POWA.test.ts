import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { POWA } from "../../typechain-types";
import { x18, ZeroAddress } from "../utils";
import { expect } from "chai";
import { deployPOWA } from "../contractHelpers";

describe("POWA contract test", function () {
    let powa: POWA;

    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let claimCall: SignerWithAddress;

    beforeEach(async () => {
        [owner, alice, claimCall] = await ethers.getSigners();

        // deploy POWA
        powa = await deployPOWA([claimCall.address]);
    });

    describe("#constructor", function () {
        it("test constructor success", async () => {
            expect(await powa.minters(claimCall.address)).to.be.true;
        });
    });

    describe("#Logic functions test", function () {
        let amount = x18(10000);

        describe("#mint", function () {
            it("test mint success", async () => {
                await powa.connect(claimCall).mint(alice.address, amount);

                expect(await powa.balanceOf(alice.address)).to.equal(amount);
            });

            it("test mint not Minter call", async () => {
                await expect(
                    powa.connect(alice).mint(alice.address, amount),
                ).to.revertedWith("Minter only");
            });

            it("test mint the amount is zero", async () => {
                await expect(
                    powa.connect(claimCall).mint(alice.address, 0),
                ).to.revertedWith("Invalid zero amount");
            });
        });

        describe("#burn", function () {
            it("test burn success", async () => {
                await powa.connect(claimCall).mint(alice.address, amount);
                expect(await powa.balanceOf(alice.address)).to.equal(amount);

                await powa.connect(alice).burn(amount.div(2));
                expect(await powa.balanceOf(alice.address)).to.equal(
                    amount.div(2),
                );
            });
        });
    });

    describe("#Admin functions test", function () {
        describe("#setMinter", function () {
            let newAccount = ethers.Wallet.createRandom();

            it("test setMinter success", async () => {
                expect(await powa.minters(newAccount.address)).to.be.false;
                await powa.connect(owner).setMinter(newAccount.address);
                expect(await powa.minters(newAccount.address)).to.be.true;
            });

            it("test setMinter event", async () => {
                await expect(powa.connect(owner).setMinter(newAccount.address))
                    .to.emit(powa, "EventSetMinter")
                    .withArgs(newAccount.address);
            });

            it("test setMinter not owner call", async () => {
                await expect(
                    powa.connect(alice).setMinter(newAccount.address),
                ).to.revertedWith("Ownable: caller is not the owner");
            });

            it("test setMinter to zero address", async () => {
                await expect(
                    powa.connect(owner).setMinter(ZeroAddress),
                ).to.revertedWith("Invalid zero address");
            });
        });

        describe("#unsetMinter", function () {
            it("test unsetMinter success", async () => {
                expect(await powa.minters(claimCall.address)).to.be.true;
                await powa.connect(owner).unsetMinter(claimCall.address);
                expect(await powa.minters(claimCall.address)).to.be.false;
            });

            it("test unsetMinter event", async () => {
                await expect(powa.connect(owner).unsetMinter(claimCall.address))
                    .to.emit(powa, "EventUnsetMinter")
                    .withArgs(claimCall.address);
            });

            it("test unsetMinter not owner call", async () => {
                await expect(
                    powa.connect(alice).unsetMinter(claimCall.address),
                ).to.revertedWith("Ownable: caller is not the owner");
            });

            it("test unsetMinter to zero address", async () => {
                await expect(
                    powa.connect(owner).unsetMinter(ZeroAddress),
                ).to.revertedWith("Invalid zero address");
            });
        });
    });
});
