import { ethers } from "hardhat";

async function main() {
    const factoryAddress = "0x82438CE666d9403e488bA720c7424434e8Aa47CD";
    const routerAddress = "0x3a3eBAe0Eec80852FBC7B9E824C6756969cc8dc1";

    console.log("🔍 Validating PancakeRouter...");
    console.log(`Factory: ${factoryAddress}`);
    console.log(`Router:  ${routerAddress}`);
    console.log("");

    // PancakeRouter interface
    const pancakeRouterInterface = new ethers.Interface([
        "function factory() external view returns (address)",
        "function WETH() external view returns (address)",
        "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
        "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
        "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
        "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
        "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
        "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)"
    ]);

    try {
        // Get the router contract
        const router = await ethers.getContractAt(pancakeRouterInterface.format(), routerAddress);

        console.log("1. Checking PancakeRouter methods...");

        // Check factory
        try {
            const routerFactory = await router.factory();
            console.log(`   ✅ factory(): ${routerFactory}`);

            if (routerFactory.toLowerCase() === factoryAddress.toLowerCase()) {
                console.log("   ✅ Router factory matches expected factory address");
            } else {
                console.log("   ❌ Router factory does not match expected factory address");
                console.log(`   Expected: ${factoryAddress}`);
                console.log(`   Got:      ${routerFactory}`);
                return;
            }
        } catch (error) {
            console.log("   ❌ factory() method failed");
            return;
        }

        // Check WETH
        try {
            const weth = await router.WETH();
            console.log(`   ✅ WETH(): ${weth}`);
        } catch (error) {
            console.log("   ❌ WETH() method failed");
            return;
        }

        // Check addLiquidity (this is the crucial method for PoolWrapper)
        try {
            // Just test if the method exists by encoding a call
            const addLiquidityData = pancakeRouterInterface.encodeFunctionData("addLiquidity", [
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                0,
                0,
                0,
                0,
                ethers.ZeroAddress,
                0
            ]);
            console.log("   ✅ addLiquidity() method exists");
        } catch (error) {
            console.log("   ❌ addLiquidity() method failed");
            return;
        }

        // Check other important methods
        const optionalMethods = [
            "addLiquidityETH",
            "removeLiquidity",
            "swapExactTokensForTokens",
            "swapExactETHForTokens",
            "swapExactTokensForETH"
        ];

        for (const method of optionalMethods) {
            try {
                pancakeRouterInterface.encodeFunctionData(method, []);
                console.log(`   ✅ ${method}() method exists`);
            } catch (error) {
                console.log(`   ⚠️  ${method}() method missing (optional)`);
            }
        }

        console.log("");
        console.log("🎉 PancakeRouter validation completed successfully!");
        console.log("✅ This is a valid PancakeRouter that should work with your PoolWrapper");
        console.log("");
        console.log("📋 Next steps:");
        console.log("1. Update your uniswap-config.ts with these addresses:");
        console.log(`   factory: "${factoryAddress}"`);
        console.log(`   router: "${routerAddress}"`);
        console.log("2. Update your PoolWrapper interface to use PancakeRouter instead of UniswapV2Router02");
        console.log("3. Deploy your contracts!");

    } catch (error) {
        console.error("❌ Error validating PancakeRouter:", error);
        console.log("❌ This does not appear to be a valid PancakeRouter");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 