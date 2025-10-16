import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { enableMainnetFork } from "./helpers/fork";
import { deployV2PoolWrapperFork, deployV3PoolWrapperFork } from "./helpers/poolWrappers";

describe("PoolWrapper (fork)", function () {
    async function poolFixture() {
        // Enable fork and stabilize base fee
        await enableMainnetFork();

        const [deployer, liquidityProvider, other] = await ethers.getSigners();

        // Deploy two local ERC20 mocks to act as tokens
        const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
        const tokenA = await ERC20Mock.deploy("TokenA", "TKA");
        const tokenB = await ERC20Mock.deploy("TokenB", "TKB");
        await tokenA.waitForDeployment();
        await tokenB.waitForDeployment();

        // Deploy wrappers pointing to canonical mainnet contracts
        const v2 = await deployV2PoolWrapperFork();
        const v3 = await deployV3PoolWrapperFork(3000);

        const v2Wrapper = await ethers.getContractAt("V2PoolWrapper", v2.wrapperAddress);
        const v3Wrapper = await ethers.getContractAt("V3PoolWrapper", v3.wrapperAddress);

        // Pre-fund wrappers with tokens so tests don't mint each time
        const baseAmount = ethers.parseEther("1000");
        await tokenA.mint(await v2Wrapper.getAddress(), baseAmount);
        await tokenB.mint(await v2Wrapper.getAddress(), baseAmount);
        await tokenA.mint(await v3Wrapper.getAddress(), baseAmount);
        await tokenB.mint(await v3Wrapper.getAddress(), baseAmount);

        return {
            accounts: { deployer, liquidityProvider, other },
            tokens: { tokenA, tokenB },
            v2: { wrapper: v2Wrapper, factory: v2.factoryAddress, router: v2.routerAddress },
            v3: { wrapper: v3Wrapper, factory: v3.factoryAddress, positionManager: v3.positionManagerAddress, fee: v3.feeTier },
            balances: { baseAmount },
        };
    }

    describe("V2", function () {
        it("creates a new pool and adds liquidity", async function () {
            const { tokens, v2, accounts } = await loadFixture(poolFixture);

            const amount0 = ethers.parseEther("10");
            const amount1 = ethers.parseEther("10");

            const createPoolMsg = {
                token0: await tokens.tokenA.getAddress(),
                token1: await tokens.tokenB.getAddress(),
                amount0,
                amount1,
                creator: accounts.liquidityProvider.address,
            };

            const tx = await v2.wrapper.connect(accounts.liquidityProvider).createPool(createPoolMsg);
            const receipt = await tx.wait();

            // Read PoolCreated event generically
            const iface = new ethers.Interface([
                "event PoolCreated(address indexed stream, address indexed pool, address indexed poolWrapper, address token0, address token1, uint256 token0Amount, uint256 token1Amount)",
            ]);
            const topic = ethers.id("PoolCreated(address,address,address,address,address,uint256,uint256)");
            const ev = receipt?.logs.find((l: any) => l.topics[0] === topic);
            expect(ev).to.not.be.undefined;
            const parsed = iface.parseLog(ev!);

            const poolAddress = parsed!.args.pool as string;
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);

            // Verify tokens actually moved into the pair contract
            const balA = await tokens.tokenA.balanceOf(poolAddress);
            const balB = await tokens.tokenB.balanceOf(poolAddress);
            expect(balA).to.be.gt(0);
            expect(balB).to.be.gt(0);
        });

        it("reuses existing pool on subsequent calls", async function () {
            const { tokens, v2, accounts } = await loadFixture(poolFixture);

            const amount0 = ethers.parseEther("5");
            const amount1 = ethers.parseEther("5");

            const tokenAAddr = await tokens.tokenA.getAddress();
            const tokenBAddr = await tokens.tokenB.getAddress();

            // Minimal ABI to read getPair
            const v2Factory = new ethers.Contract(
                v2.factory,
                ["function getPair(address,address) view returns (address)"],
                ethers.provider
            );

            // First create (wrapper already pre-funded by fixture)
            const msg1 = { token0: tokenAAddr, token1: tokenBAddr, amount0, amount1, creator: accounts.deployer.address };
            await (await v2.wrapper.createPool(msg1)).wait();
            const pool1 = await v2Factory.getPair(tokenAAddr, tokenBAddr);

            // Second create (should use same pool)
            await (await v2.wrapper.connect(accounts.other).createPool(msg1)).wait();
            const pool2 = await v2Factory.getPair(tokenAAddr, tokenBAddr);

            expect(pool1).to.equal(pool2);
        });

        it("reverts on insufficient wrapper balance", async function () {
            const { tokens, v2 } = await loadFixture(poolFixture);
            const amount0 = ethers.parseEther("1");
            const amount1 = ethers.parseEther("10000000"); // exceed pre-funded balance
            await expect(
                v2.wrapper.createPool({
                    token0: await tokens.tokenA.getAddress(),
                    token1: await tokens.tokenB.getAddress(),
                    amount0,
                    amount1,
                    creator: (await ethers.getSigners())[0].address,
                })
            ).to.be.revertedWithCustomError(v2.wrapper, "InsufficientBalance");
        });
    });

    describe("V3", function () {
        it("creates a new v3 pool and adds full-range liquidity", async function () {
            const { tokens, v3, accounts } = await loadFixture(poolFixture);

            const amount0 = ethers.parseEther("10");
            const amount1 = ethers.parseEther("10");

            const msg = {
                token0: await tokens.tokenA.getAddress(),
                token1: await tokens.tokenB.getAddress(),
                amount0,
                amount1,
                creator: accounts.liquidityProvider.address,
            };

            const tx = await v3.wrapper.connect(accounts.liquidityProvider).createPool(msg);
            const receipt = await tx.wait();

            // Parse PoolCreated
            const iface = new ethers.Interface([
                "event PoolCreated(address indexed stream, address indexed pool, address indexed poolWrapper, address token0, address token1, uint256 token0Amount, uint256 token1Amount)",
            ]);
            const topic = ethers.id("PoolCreated(address,address,address,address,address,uint256,uint256)");
            const ev = receipt?.logs.find((l: any) => l.topics[0] === topic);
            expect(ev).to.not.be.undefined;
            const parsed = iface.parseLog(ev!);
            const poolAddress = parsed!.args.pool as string;
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);

            const balA = await tokens.tokenA.balanceOf(poolAddress);
            const balB = await tokens.tokenB.balanceOf(poolAddress);
            expect(balA).to.be.gt(0);
            expect(balB).to.be.gt(0);
        });

        it("reverts on zero amounts", async function () {
            const { tokens, v3 } = await loadFixture(poolFixture);
            await expect(
                v3.wrapper.createPool({
                    token0: await tokens.tokenA.getAddress(),
                    token1: await tokens.tokenB.getAddress(),
                    amount0: 0,
                    amount1: ethers.parseEther("1"),
                    creator: (await ethers.getSigners())[0].address,
                })
            ).to.be.revertedWithCustomError(v3.wrapper, "InvalidAmount");
        });
    });
});
