import { toBig, x18, x_n } from "./utils";

export const Ethereum_WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
export const Ethereum_CurveFi = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
export const Ethereum_StETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
export const Ethereum_PROTOCOL_DATA_PROVIDER =
    "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3";
export const Ethereum_Uniswap = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
export const OJEE_TotalSupply = x18(100000000000);

export const STRATEGY_WETHTOLIDO_PACKAGE_VERSION = "0.0.1";

export const TestTokenTotalSupply = x18(10000)
    .mul(toBig(10000))
    .mul(toBig(10000));
export const USDTTotalSupply = x_n(10000, 6)
    .mul(toBig(10000))
    .mul(toBig(10000));

export const ERC20TokenFarmPool_PERSECOND_RATE = x_n(1, 9);
export const ERC20TokenFarmPool_REWARD_APR =
    ERC20TokenFarmPool_PERSECOND_RATE.mul(toBig(31_556_952));
export const AAVE_APR = 500; // 5%
export const AAVE_PERSECOND_APR = toBig(AAVE_APR)
    .mul(x18(1))
    .div(10000)
    .div(3652425)
    .div(86400);
