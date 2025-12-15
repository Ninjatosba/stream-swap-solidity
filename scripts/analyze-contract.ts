import { ethers } from "hardhat";

async function main() {
    const contractAddress = "0x3a3eBAe0Eec80852FBC7B9E824C6756969cc8dc1";

    console.log("🔍 Analyzing Contract...");
    console.log(`Address: ${contractAddress}`);
    console.log("");

    // Get contract bytecode
    const code = await ethers.provider.getCode(contractAddress);
    console.log("1. Contract Information:");
    console.log(`   Bytecode length: ${code.length} characters`);
    console.log(`   Is contract: ${code !== "0x"}`);

    if (code === "0x") {
        console.log("   ❌ No contract found at this address");
        return;
    }

    console.log("");

    // Try different interfaces to see what this contract might be
    console.log("2. Testing different contract interfaces...");

    const interfaces = [
        {
            name: "UniswapV2Router02",
            abi: [
                "function factory() external view returns (address)",
                "function WETH() external view returns (address)",
                "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)"
            ]
        },
        {
            name: "UniswapV2Factory",
            abi: [
                "function getPair(address tokenA, address tokenB) external view returns (address pair)",
                "function createPair(address tokenA, address tokenB) external returns (address pair)"
            ]
        },
        {
            name: "ERC20",
            abi: [
                "function name() external view returns (string)",
                "function symbol() external view returns (string)",
                "function decimals() external view returns (uint8)",
                "function totalSupply() external view returns (uint256)",
                "function balanceOf(address owner) external view returns (uint256)"
            ]
        }
    ];

    for (const iface of interfaces) {
        try {
            const contract = await ethers.getContractAt(iface.abi, contractAddress);
            console.log(`   ✅ Successfully created ${iface.name} interface`);

            // Try to call some methods to see if they work
            if (iface.name === "UniswapV2Router02") {
                try {
                    const factory = await contract.factory();
                    console.log(`      factory(): ${factory}`);
                } catch (e) {
                    console.log(`      factory(): ❌ Failed`);
                }

                try {
                    const weth = await contract.WETH();
                    console.log(`      WETH(): ${weth}`);
                } catch (e) {
                    console.log(`      WETH(): ❌ Failed`);
                }
            } else if (iface.name === "UniswapV2Factory") {
                try {
                    // Try to get a pair with zero addresses
                    const pair = await contract.getPair(ethers.ZeroAddress, ethers.ZeroAddress);
                    console.log(`      getPair(): ${pair}`);
                } catch (e) {
                    console.log(`      getPair(): ❌ Failed`);
                }
            } else if (iface.name === "ERC20") {
                try {
                    const name = await contract.name();
                    console.log(`      name(): ${name}`);
                } catch (e) {
                    console.log(`      name(): ❌ Failed`);
                }

                try {
                    const symbol = await contract.symbol();
                    console.log(`      symbol(): ${symbol}`);
                } catch (e) {
                    console.log(`      symbol(): ❌ Failed`);
                }
            }
        } catch (error) {
            console.log(`   ❌ Failed to create ${iface.name} interface`);
        }
    }

    console.log("");

    // Check for common function signatures in bytecode
    console.log("3. Searching for common function signatures in bytecode...");

    const commonSignatures = [
        { name: "factory()", signature: "0xc45a0155" },
        { name: "WETH()", signature: "0x95d89b41" },
        { name: "addLiquidity", signature: "0xe8e33700" },
        { name: "swapExactTokensForTokens", signature: "0x38ed1739" },
        { name: "createPair", signature: "0xc9c65396" },
        { name: "getPair", signature: "0xe6a43905" },
        { name: "name()", signature: "0x06fdde03" },
        { name: "symbol()", signature: "0x95d89b41" },
        { name: "decimals()", signature: "0x313ce567" },
        { name: "totalSupply()", signature: "0x18160ddd" },
        { name: "balanceOf(address)", signature: "0x70a08231" }
    ];

    for (const sig of commonSignatures) {
        if (code.includes(sig.signature)) {
            console.log(`   ✅ Found ${sig.name} signature: ${sig.signature}`);
        } else {
            console.log(`   ❌ Missing ${sig.name} signature: ${sig.signature}`);
        }
    }

    console.log("");
    console.log("📋 Analysis Summary:");
    console.log("Based on the function signatures found in the bytecode,");
    console.log("this will help determine what type of contract this is.");
    console.log("");
    console.log("If this is a router but missing addLiquidity, you may need to:");
    console.log("1. Find a different router implementation");
    console.log("2. Deploy your own router pointing to the factory");
    console.log("3. Use a different DEX protocol");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 