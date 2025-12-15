import { assert, expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { enableMainnetFork } from "../helpers/fork";
import { deployAerodromePoolWrapperFork, deployV2PoolWrapperFork, deployV3PoolWrapperFork } from "../helpers/poolWrappers";
import { PoolWrapperTypes } from "../../typechain-types/src/PoolWrapper";
import { EventLog } from "ethers";

describe("PoolWrapper (fork)", function () {
    function sortForMsg(tokenA: string, tokenB: string, amountA: bigint, amountB: bigint) {
        if (tokenA.toLowerCase() < tokenB.toLowerCase()) {
            return { token0: tokenA, token1: tokenB, amount0Desired: amountA, amount1Desired: amountB };
        }
        return { token0: tokenB, token1: tokenA, amount0Desired: amountB, amount1Desired: amountA };
    }
    async function poolFixture(network?: string) {
        // Enable fork and stabilize base fee
        await enableMainnetFork(undefined, network);

        // log network
        console.log("Network:", await ethers.provider.getNetwork());

        const [deployer, liquidityProvider, other] = await ethers.getSigners();

        // Deploy two local ERC20 mocks to act as tokens
        const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
        const tokenA = await ERC20Mock.deploy("TokenA", "TKA", 18);
        const tokenB = await ERC20Mock.deploy("TokenB", "TKB", 18);
        await tokenA.waitForDeployment();
        await tokenB.waitForDeployment();

        // Deploy wrappers pointing to canonical mainnet contracts
        const v2 = await deployV2PoolWrapperFork();
        const v3 = await deployV3PoolWrapperFork(3000);
        const aerodrome = await deployAerodromePoolWrapperFork();

        const v2Wrapper = await ethers.getContractAt("V2PoolWrapper", v2.wrapperAddress);
        const v3Wrapper = await ethers.getContractAt("V3PoolWrapper", v3.wrapperAddress);
        const aerodromeWrapper = await ethers.getContractAt("AerodromePoolWrapper", aerodrome.wrapperAddress);
        // Pre-fund wrappers with tokens so tests don't mint each time
        const baseAmount = ethers.parseEther("1000");
        await tokenA.mint(await v2Wrapper.getAddress(), baseAmount);
        await tokenB.mint(await v2Wrapper.getAddress(), baseAmount);
        await tokenA.mint(await v3Wrapper.getAddress(), baseAmount);
        await tokenB.mint(await v3Wrapper.getAddress(), baseAmount);
        await tokenA.mint(await aerodromeWrapper.getAddress(), baseAmount);
        await tokenB.mint(await aerodromeWrapper.getAddress(), baseAmount);

        return {
            accounts: { deployer, liquidityProvider, other },
            tokens: { tokenA, tokenB },
            v2: { wrapper: v2Wrapper, factory: v2.factoryAddress, router: v2.routerAddress },
            v3: { wrapper: v3Wrapper, factory: v3.factoryAddress, positionManager: v3.positionManagerAddress, fee: v3.feeTier },
            aerodrome: { wrapper: aerodromeWrapper, factory: aerodrome.factoryAddress, router: aerodrome.routerAddress },
            balances: { baseAmount },
        };
    }

    describe("V2", function () {
        it("creates a new pool and adds liquidity", async function () {
            const { tokens, v2, accounts } = await loadFixture(poolFixture);

            const amount0 = ethers.parseEther("10");
            const amount1 = ethers.parseEther("10");

            const a = await tokens.tokenA.getAddress();
            const b = await tokens.tokenB.getAddress();
            const sorted = sortForMsg(a, b, amount0, amount1);
            const createPoolMsg = { ...sorted, creator: accounts.liquidityProvider.address, extra: "0x" };

            const tx = await v2.wrapper.connect(accounts.liquidityProvider).createPool(createPoolMsg);
            const receipt = await tx.wait();

            // Get the pool address from the return value
            const poolInfo = await v2.wrapper.streamPools(accounts.liquidityProvider.address);
            const poolAddress = poolInfo.poolAddress;
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
            const sorted = sortForMsg(tokenAAddr, tokenBAddr, amount0, amount1);
            const msg1 = { ...sorted, creator: accounts.deployer.address, extra: "0x" };
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
            const a = await tokens.tokenA.getAddress();
            const b = await tokens.tokenB.getAddress();
            const sorted2 = sortForMsg(a, b, amount0, amount1);
            await expect(
                v2.wrapper.createPool({
                    ...sorted2,
                    creator: (await ethers.getSigners())[0].address,
                    extra: "0x",
                })
            ).to.be.revertedWithCustomError(v2.wrapper, "InsufficientBalance");
        });
    });

    describe("V3", function () {
        it("creates a new v3 pool and adds full-range liquidity", async function () {
            const { tokens, v3, accounts } = await loadFixture(poolFixture);

            const amount0 = ethers.parseEther("10");
            const amount1 = ethers.parseEther("10");

            const a = await tokens.tokenA.getAddress();
            const b = await tokens.tokenB.getAddress();
            const sorted = sortForMsg(a, b, amount0, amount1);
            const msg = { ...sorted, creator: accounts.liquidityProvider.address, extra: "0x" };

            const tx = await v3.wrapper.connect(accounts.liquidityProvider).createPool(msg);
            const receipt = await tx.wait();

            // Get the pool address from the return value
            const poolInfo = await v3.wrapper.streamPools(accounts.liquidityProvider.address);
            const poolAddress = poolInfo.poolAddress;
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);

            const balA = await tokens.tokenA.balanceOf(poolAddress);
            const balB = await tokens.tokenB.balanceOf(poolAddress);
            expect(balA).to.be.gt(0);
            expect(balB).to.be.gt(0);
        });

        it("reverts on zero amounts", async function () {
            const { tokens, v3 } = await loadFixture(poolFixture);
            const a = await tokens.tokenA.getAddress();
            const b = await tokens.tokenB.getAddress();
            const sorted = sortForMsg(a, b, 0n, ethers.parseEther("1"));
            await expect(
                v3.wrapper.createPool({
                    ...sorted,
                    creator: (await ethers.getSigners())[0].address,
                    extra: "0x",
                })
            ).to.be.revertedWithCustomError(v3.wrapper, "InvalidAmount");
        });
    });

    describe("Aerodrome", function () {
        it("creates a new aerodrome pool and adds full-range liquidity", async function () {
            const { tokens, aerodrome, accounts } = await poolFixture("base");

            const amount0 = ethers.parseEther("10");
            const amount1 = ethers.parseEther("10");

            const a = await tokens.tokenA.getAddress();
            const b = await tokens.tokenB.getAddress();
            const sorted = sortForMsg(a, b, amount0, amount1);
            const createPoolMsg = { ...sorted, creator: accounts.liquidityProvider.address, extra: "0x" };

            const tx = await aerodrome.wrapper.connect(accounts.liquidityProvider).createPool(createPoolMsg);
            await tx.wait();

            // Get pool info from storage after the transaction
            const poolInfo = await aerodrome.wrapper.streamPools(accounts.liquidityProvider.address);
            expect(poolInfo.poolAddress).to.not.equal(ethers.ZeroAddress);
            expect(poolInfo.token0).to.equal(await tokens.tokenA.getAddress());
            expect(poolInfo.token1).to.equal(await tokens.tokenB.getAddress());
            expect(poolInfo.amount0).to.equal(amount0);
            expect(poolInfo.amount1).to.equal(amount1);
            expect(poolInfo.creator).to.equal(accounts.liquidityProvider.address);
            expect(poolInfo.refundedAmount0).to.equal(0);
            expect(poolInfo.refundedAmount1).to.equal(0);
        });

        it("reverts on zero amounts", async function () {
            const { tokens, aerodrome } = await poolFixture("base");
            const a = await tokens.tokenA.getAddress();
            const b = await tokens.tokenB.getAddress();
            const sorted0 = sortForMsg(a, b, 0n, ethers.parseEther("1"));
            await expect(
                aerodrome.wrapper.createPool({
                    ...sorted0,
                    creator: (await ethers.getSigners())[0].address,
                    extra: "0x",
                })
            ).to.be.revertedWithCustomError(aerodrome.wrapper, "InvalidAmount");
        });

        it("reverts on insufficient wrapper balance", async function () {
            const { tokens, aerodrome } = await poolFixture("base");
            const amount0 = ethers.parseEther("1");
            const amount1 = ethers.parseEther("10000000"); // exceed pre-funded balance
            const a = await tokens.tokenA.getAddress();
            const b = await tokens.tokenB.getAddress();
            const sorted1 = sortForMsg(a, b, amount0, amount1);
            await expect(
                aerodrome.wrapper.createPool({
                    ...sorted1,
                    creator: (await ethers.getSigners())[0].address,
                    extra: "0x",
                })
            ).to.be.revertedWithCustomError(aerodrome.wrapper, "InsufficientBalance");
        });

        it("reverts on invalid token pair", async function () {
            const { tokens, aerodrome } = await poolFixture("base");
            const a = await tokens.tokenA.getAddress();
            await expect(
                aerodrome.wrapper.createPool({
                    token0: a,
                    token1: a,
                    amount0Desired: ethers.parseEther("10"),
                    amount1Desired: ethers.parseEther("10"),
                    creator: (await ethers.getSigners())[0].address,
                    extra: "0x",
                })
            ).to.be.revertedWithCustomError(aerodrome.wrapper, "DifferentTokensRequired");
        });

        it("reuses existing pool on subsequent calls", async function () {
            const { tokens, aerodrome, accounts } = await poolFixture("base");

            const amount0 = ethers.parseEther("5");
            const amount1 = ethers.parseEther("5");

            const tokenAAddr = await tokens.tokenA.getAddress();
            const tokenBAddr = await tokens.tokenB.getAddress();

            // Minimal ABI to read getPool
            const aerodromeFactory = new ethers.Contract(
                aerodrome.factory,
                ["function getPool(address,address,bool) view returns (address)"],
                ethers.provider
            );

            // First create (wrapper already pre-funded by fixture)
            const sorted = sortForMsg(tokenAAddr, tokenBAddr, amount0, amount1);
            const msg1 = { ...sorted, creator: accounts.deployer.address, extra: "0x" };
            await (await aerodrome.wrapper.createPool(msg1)).wait();
            const pool1 = await aerodromeFactory.getPool(tokenAAddr, tokenBAddr, false);

            // Second create (should use same pool)
            await (await aerodrome.wrapper.connect(accounts.other).createPool(msg1)).wait();
            const pool2 = await aerodromeFactory.getPool(tokenAAddr, tokenBAddr, false);

            expect(pool1).to.equal(pool2);
        });

        it("reverts on invalid creator", async function () {
            const { tokens, aerodrome } = await poolFixture("base");
            await expect(
                aerodrome.wrapper.createPool({
                    token0: await tokens.tokenA.getAddress(),
                    token1: await tokens.tokenB.getAddress(),
                    amount0Desired: ethers.parseEther("10"),
                    amount1Desired: ethers.parseEther("10"),
                    creator: ethers.ZeroAddress,
                    extra: "0x",
                })
            ).to.be.revertedWithCustomError(aerodrome.wrapper, "InvalidAddress");
        });
    });
});