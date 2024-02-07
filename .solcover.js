//.solcover.js
module.exports = {
    skipFiles: [
        "mock",
        "common/Timelock.sol",
    ],
    configureYulOptimizer: true,
    solcOptimizerDetails: {
        peephole: true,
        inliner: false,
        jumpdestRemover: true,
        orderLiterals: true,  // <-- TRUE! Stack too deep when false
        deduplicate: false,
        cse: false,
        constantOptimizer: false,
        yul: true,
        yulDetails: {
            stackAllocation: true,
        }
    }
};
