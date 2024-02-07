import { ethers } from "hardhat";
import { writeLog, runEnvironment, Manager, sleep } from "./utils";
const STATIC = {
    mainnet: {
        OJEEReceiptor: "",
        VWProxyAdmin: "",
        WETHVault: "",
        USDTVault: "",
        OJEEVault: "",
        ERC20TokenFarmPool: "",
    },
    sepolia_testnet: {
        OJEEReceiptor: "",
        VWProxyAdmin: "",
        WETHVault: "",
        USDTVault: "",
        OJEEVault: "",
        ERC20TokenFarmPool: "",
    },
};

let manager = new Manager(STATIC, {}, runEnvironment(), __filename);
const CONFIG = manager.CONFIG;

async function main() {
    const owner = (await ethers.getSigners())[0];
    console.log("owner:", owner.address, " env:", manager.RunENV);

    console.log("Contract deploy =====>");

    // OJEE
    const ct_OJEE = await manager.deployOrLinkContract(
        "OJEE",
        CONFIG.OJEEReceiptor,
    );
    // POWA
    const ct_POWA = await manager.deployOrLinkContract("POWA");

    // WETHStrategyToLido
    const ct_WETHStrategyToLido = await manager.deployUpgradeableOrLink(
        "WETHStrategyToLido",
        CONFIG.VWProxyAdmin,
        [CONFIG.WETHVault],
    );

    await sleep(3);

    // USDTStrategyToLender
    const ct_USDTStrategyToLender = await manager.deployUpgradeableOrLink(
        "USDTStrategyToLender",
        CONFIG.VWProxyAdmin,
        [CONFIG.USDTVault],
    );

    await sleep(3);

    // GenericAaveV3
    const ct_GenericAaveV3 = await manager.deployUpgradeableOrLink(
        "GenericAaveV3",
        CONFIG.VWProxyAdmin,
        [ct_USDTStrategyToLender.address, "AaveV3"],
    );

    writeLog(
        "ct_USDTStrategyToLender.addLender",
        await ct_USDTStrategyToLender.addLender(ct_GenericAaveV3.address),
    );

    await sleep(3);

    // OJEEStrategyToFarm
    const ct_OJEEStrategyToFarm = await manager.deployUpgradeableOrLink(
        "OJEEStrategyToFarm",
        CONFIG.VWProxyAdmin,
        [CONFIG.OJEEVault, CONFIG.ERC20TokenFarmPool],
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
