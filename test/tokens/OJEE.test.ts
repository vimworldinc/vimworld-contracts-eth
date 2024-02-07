import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { OJEE } from "../../typechain-types";
import { deployContract, ZeroAddress } from "../utils";
import { expect } from "chai";
import { OJEE_TotalSupply } from "../contractsConfig";

describe("OJEE contract test", function () {
    let ojee: OJEE;

    let owner: SignerWithAddress;
    let alice: SignerWithAddress;

    beforeEach(async () => {
        [owner, alice] = await ethers.getSigners();

        // deploy OJEE
        ojee = await deployContract("OJEE", alice.address);
    });

    describe("#constructor", function () {
        it("test constructor success", async () => {
            expect(await ojee.balanceOf(alice.address)).to.equal(
                OJEE_TotalSupply,
            );
        });

        it("test constructor the ower is zero address", async () => {
            await expect(
                deployContract("OJEE", ZeroAddress),
            ).to.be.revertedWith("Invalid zero address");
        });
    });

    describe("#burn", function () {
        it("test burn success", async () => {
            await ojee.connect(alice).burn(OJEE_TotalSupply.div(2));
            expect(await ojee.balanceOf(alice.address)).to.equal(
                OJEE_TotalSupply.div(2),
            );
        });
    });
});
