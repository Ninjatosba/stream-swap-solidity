import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
    Stream,
    StreamFactory,
    IUniswapV2Factory,
    IUniswapV2Pair
} from "../typechain-types";
import { parseUnits } from "ethers";

// Mainnet addresses (properly checksummed)
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH
const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"; // Uniswap V2 Factory
const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Uniswap V2 Router 02

// USDC whale address (can be used for impersonation)
const USDC_WHALE = "0x55FE002aefF02F77364de339a1292923A15844B8"; // Circle USDC Treasury
// WETH whale address (can be used for impersonation)
const WETH_WHALE = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28"; // Binance WETH Wallet

describe("Stream - Mainnet Fork Tests", function () {
    let stream: Stream;
    let streamFactory: StreamFactory;
    let usdc: any; // Using any type for now
    let weth: any; // Using any type for now
    let uniswapFactory: IUniswapV2Factory;
    let deployer: SignerWithAddress;
    let creator: SignerWithAddress;
    let subscriber: SignerWithAddress;
    before(async function () {
        // Skip if mainnet forking is not enabled
        if (process.env.MAINNET_FORKING_ENABLED !== "true") {
            this.skip();
        }

        [deployer, creator, subscriber] = await ethers.getSigners();

        // Get contract instances
        console.log("Getting WETH contract instance...");
        weth = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", WETH_ADDRESS);
        console.log("WETH contract address:", await weth.getAddress());

        console.log("Getting USDC contract instance...");
        usdc = await ethers.getContractAt("contracts/interfaces/IERC20.sol:IERC20", USDC_ADDRESS);
        console.log("USDC contract address:", await usdc.getAddress());

        console.log("Getting Uniswap Factory instance...");
        uniswapFactory = await ethers.getContractAt("IUniswapV2Factory", UNISWAP_V2_FACTORY);
        console.log("Uniswap Factory address:", await uniswapFactory.getAddress());

        // Impersonate whales
        console.log("Impersonating WETH whale...");
        await ethers.provider.send("hardhat_impersonateAccount", [WETH_WHALE]);
        console.log("Impersonating USDC whale...");
        await ethers.provider.send("hardhat_impersonateAccount", [USDC_WHALE]);
        const usdcWhaleSigner = await ethers.getSigner(USDC_WHALE);
        const wethWhaleSigner = await ethers.getSigner(WETH_WHALE);
        console.log("Whale signers created");

        // Fund whales with ETH for gas fees
        console.log("Funding WETH whale with ETH...");
        await deployer.sendTransaction({
            to: WETH_WHALE,
            value: ethers.parseEther("10"), // Send 10 ETH for gas fees
            maxFeePerGas: ethers.parseUnits("200", "gwei"),
            maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
        });
        console.log("Funding USDC whale with ETH...");
        await deployer.sendTransaction({
            to: USDC_WHALE,
            value: ethers.parseEther("10"), // Send 10 ETH for gas fees
            maxFeePerGas: ethers.parseUnits("200", "gwei"),
            maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
        });

        // Debug WETH whale balance
        console.log("Checking WETH whale balance...");
        const wethWhaleBalance = await weth.balanceOf(WETH_WHALE);
        console.log("WETH Whale Balance:", ethers.formatUnits(wethWhaleBalance, 18));

        // Fund creator with 1000 WETH
        console.log("Transferring WETH to creator...");
        try {
            await weth.connect(wethWhaleSigner).transfer(creator.address, parseUnits("1000", 18));
        } catch (error) {
            console.error("Error transferring WETH:", error);
            throw error;
        }

        // Fund subscriber with 1000 USDC
        await usdc.connect(usdcWhaleSigner).transfer(subscriber.address, parseUnits("1000", 6));

        // Deploy StreamFactory with constructor parameters
        const StreamFactory = await ethers.getContractFactory("StreamFactory");

        // Create exitFeeRatio with 1% (0.01 * 1e6)
        const exitFeeRatio = {
            value: ethers.parseUnits("0.01", 6) // 1% = 0.01 * 1e6
        };

        streamFactory = await StreamFactory.deploy(
            0, // streamCreationFee
            ethers.ZeroAddress, // streamCreationFeeToken
            exitFeeRatio, // exitFeeRatio (1% = 0.01 * 1e6)
            1,
            1,
            1,
            [USDC_ADDRESS], // acceptedInSupplyTokens
            deployer.address, // feeCollector
            deployer.address, // protocolAdmin
            "1.0.0", // tosVersion
            UNISWAP_V2_FACTORY,
            UNISWAP_V2_ROUTER
        );
        await streamFactory.waitForDeployment();
    });

    it("should create a Uniswap V2 pool and add liquidity when finalizing stream", async function () {
        // Create a new stream with USDC as input and WETH as output
        const streamOutAmount = parseUnits("0.1", 18); // 0.1 WETH
        const poolOutAmount = parseUnits("0.05", 18); // 0.05 WETH
        const bootstrappingStartTime = Math.floor(Date.now() / 1000); // current time
        const streamStartTime = bootstrappingStartTime + 3600; // 1 hour from now
        const streamEndTime = streamStartTime + 86400; // 24 hours later
        const threshold = parseUnits("100", 6); // 100 USDC threshold

        // Approve StreamFactory to spend WETH
        await weth.connect(creator).approve(await streamFactory.getAddress(), streamOutAmount + poolOutAmount);

        // Create stream
        try {
            await streamFactory.connect(creator).createStream(
                streamOutAmount,
                WETH_ADDRESS,
                bootstrappingStartTime,
                streamStartTime,
                streamEndTime,
                threshold,
                "Test Stream",
                USDC_ADDRESS,
                "1.0.0", // tosVersion
                ethers.randomBytes(32), // salt
                { isVestingEnabled: false, vestingDuration: 0, cliffDuration: 0 },
                { isVestingEnabled: false, vestingDuration: 0, cliffDuration: 0 },
                { poolOutSupplyAmount: poolOutAmount } // 0.05 WETH for pool
            );
        } catch (error) {
            console.error("Error creating stream:", error);
            // Check WETH balance and allowance
            const wethBalance = await weth.balanceOf(creator.address);
            const wethAllowance = await weth.allowance(creator.address, await streamFactory.getAddress());
            console.log("Creator WETH balance:", ethers.formatUnits(wethBalance, 18));
            console.log("Creator WETH allowance:", ethers.formatUnits(wethAllowance, 18));
            throw error;
        }

        // Get the deployed stream address
        const streamAddress = await streamFactory.getStream(0);
        stream = await ethers.getContractAt("Stream", streamAddress);

        // Set time to bootstrapping start time
        await ethers.provider.send("evm_setNextBlockTimestamp", [bootstrappingStartTime]);
        await ethers.provider.send("evm_mine", []);

        let subscriptionAmount = threshold;

        // Approve tokens for subscription
        await usdc.connect(subscriber).approve(streamAddress, subscriptionAmount);

        // Subscribe
        await stream.connect(subscriber).subscribe(
            subscriptionAmount,
        );

        // Set time to end time
        await ethers.provider.send("evm_setNextBlockTimestamp", [streamEndTime]);
        await ethers.provider.send("evm_mine", []);

        // Finalize stream
        await stream.connect(creator).finalizeStream();
    });
}); 