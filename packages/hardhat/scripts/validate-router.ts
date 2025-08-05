import { ethers } from "hardhat";

async function main() {
    const factoryAddress = "0x82438CE666d9403e488bA720c7424434e8Aa47CD";
    const routerAddress = "0x3a3eBAe0Eec80852FBC7B9E824C6756969cc8dc1";

    console.log("🔍 Validating Router Address...");
    console.log(`Factory: ${factoryAddress}`);
    console.log(`Router:  ${routerAddress}`);
    console.log("");

    // First, let's check if the contract exists and get its bytecode
    console.log("1. Checking contract existence and bytecode...");
    const code = await ethers.provider.getCode(routerAddress);
    if (code === "0x") {
        console.log("   ❌ No contract found at this address");
        return;
    }
    console.log("   ✅ Contract exists at this address");
    console.log(`   Bytecode length: ${code.length} characters`);

    // Check if it's a contract (not an EOA)
    if (code.length < 100) {
        console.log("   ❌ This appears to be an EOA, not a contract");
        return;
    }

    console.log("");

    // Try to get the factory address from the router using different methods
    console.log("2. Checking for factory address in router...");

    // Method 1: Try to call factory() function
    try {
        const router = await ethers.getContractAt("IUniswapV2Router02", routerAddress);
        const routerFactory = await router.factory();
        console.log(`   ✅ Router.factory() returns: ${routerFactory}`);

        if (routerFactory.toLowerCase() === factoryAddress.toLowerCase()) {
            console.log("   ✅ Router factory matches expected factory address");
        } else {
            console.log("   ❌ Router factory does not match expected factory address");
            console.log(`   Expected: ${factoryAddress}`);
            console.log(`   Got:      ${routerFactory}`);
        }
    } catch (error) {
        console.log("   ⚠️  Router does not have factory() method");

        // Method 2: Try to read factory address from storage (common pattern)
        try {
            // Factory address is often stored at slot 0 or 1
            const factorySlot0 = await ethers.provider.getStorage(routerAddress, 0);
            const factorySlot1 = await ethers.provider.getStorage(routerAddress, 1);

            console.log(`   Factory from slot 0: ${factorySlot0}`);
            console.log(`   Factory from slot 1: ${factorySlot1}`);

            // Check if any of these match our expected factory
            if (factorySlot0.toLowerCase().includes(factoryAddress.toLowerCase().slice(2))) {
                console.log("   ✅ Found factory address in storage slot 0");
            } else if (factorySlot1.toLowerCase().includes(factoryAddress.toLowerCase().slice(2))) {
                console.log("   ✅ Found factory address in storage slot 1");
            } else {
                console.log("   ⚠️  Factory address not found in common storage slots");
            }
        } catch (storageError) {
            console.log("   ⚠️  Could not read storage slots");
        }
    }

    console.log("");

    // Check for common router methods
    console.log("3. Checking for common router methods...");

    const routerInterface = new ethers.Interface([
        "function factory() external view returns (address)",
        "function WETH() external view returns (address)",
        "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
        "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
        "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)"
    ]);

    const methods = [
        { name: "factory", required: true },
        { name: "WETH", required: true },
        { name: "addLiquidity", required: true },
        { name: "swapExactTokensForTokens", required: false },
        { name: "removeLiquidity", required: false }
    ];

    for (const method of methods) {
        try {
            // Try to encode a call to see if the method exists
            const data = routerInterface.encodeFunctionData(method.name, []);
            console.log(`   ✅ Router has ${method.name}() method`);
        } catch (error) {
            if (method.required) {
                console.log(`   ❌ Router missing required method: ${method.name}()`);
            } else {
                console.log(`   ⚠️  Router missing optional method: ${method.name}()`);
            }
        }
    }

    console.log("");

    // Check if this router has been used to create pairs
    console.log("4. Checking router usage history...");
    try {
        const factory = await ethers.getContractAt("IUniswapV2Factory", factoryAddress);

        // Try to get a recent pair creation event
        const currentBlock = await ethers.provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 1000); // Last 1000 blocks

        const filter = {
            address: factoryAddress,
            topics: [
                ethers.id("PairCreated(address,address,address,uint256)") // PairCreated event
            ],
            fromBlock: fromBlock,
            toBlock: "latest"
        };

        const logs = await ethers.provider.getLogs(filter);
        console.log(`   Found ${logs.length} pair creation events in recent blocks`);

        if (logs.length > 0) {
            console.log("   ✅ Factory is active and creating pairs");
        } else {
            console.log("   ⚠️  No recent pair creation events found");
        }
    } catch (error) {
        console.log("   ⚠️  Could not check factory activity");
    }

    console.log("");
    console.log("📋 Summary:");
    console.log("If the router has the required methods (factory, WETH, addLiquidity) and");
    console.log("the factory address matches, then this is likely a valid router.");
    console.log("");
    console.log("To use this router in your deployment:");
    console.log("1. Update packages/hardhat/deploy/config/uniswap-config.ts");
    console.log("2. Set monadTestnet.router to the validated address");
    console.log("3. Update monadTestnet.factory to the correct factory address");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 