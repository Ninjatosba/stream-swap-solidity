import { expect } from "chai";
import { ethers } from "hardhat";
import {
    PoolWrapper,
    ERC20Mock,
    MockUniswapV2Factory,
    MockUniswapV2Router02
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PoolWrapper", function () {
    let owner: SignerWithAddress;
    let other: SignerWithAddress;
    let token0: ERC20Mock;
    let token1: ERC20Mock;
    let uniswapFactory: MockUniswapV2Factory;
    let uniswapRouter: MockUniswapV2Router02;
    let poolWrapper: PoolWrapper;

    beforeEach(async function () {
        [owner, other] = await ethers.getSigners();
        // Deploy mock tokens
        const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
        token0 = await ERC20MockFactory.deploy("Token0", "TK0") as ERC20Mock;
        token1 = await ERC20MockFactory.deploy("Token1", "TK1") as ERC20Mock;
        await token0.waitForDeployment();
        await token1.waitForDeployment();
        // Deploy mock Uniswap contracts
        const FactoryFactory = await ethers.getContractFactory("MockUniswapV2Factory");
        uniswapFactory = await FactoryFactory.deploy() as MockUniswapV2Factory;
        await uniswapFactory.waitForDeployment();
        const RouterFactory = await ethers.getContractFactory("MockUniswapV2Router02");
        uniswapRouter = await RouterFactory.deploy(await uniswapFactory.getAddress()) as MockUniswapV2Router02;
        await uniswapRouter.waitForDeployment();
        // Deploy PoolWrapper
        const PoolWrapperFactory = await ethers.getContractFactory("PoolWrapper");
        poolWrapper = await PoolWrapperFactory.deploy(
            await uniswapFactory.getAddress(),
            await uniswapRouter.getAddress()
        ) as PoolWrapper;
        await poolWrapper.waitForDeployment();
    });

    describe("constructor", function () {
        it("should revert if factory is zero address", async function () {
            const PoolWrapperFactory = await ethers.getContractFactory("PoolWrapper");
            await expect(PoolWrapperFactory.deploy(ethers.ZeroAddress, await uniswapRouter.getAddress())).to.be.revertedWithCustomError(
                poolWrapper,
                "InvalidAddress"
            );
        });
        it("should revert if router is zero address", async function () {
            const PoolWrapperFactory = await ethers.getContractFactory("PoolWrapper");
            await expect(PoolWrapperFactory.deploy(await uniswapFactory.getAddress(), ethers.ZeroAddress)).to.be.revertedWithCustomError(
                poolWrapper,
                "InvalidAddress"
            );
        });
        it("should deploy with valid addresses", async function () {
            const PoolWrapperFactory = await ethers.getContractFactory("PoolWrapper");
            const wrapper = await PoolWrapperFactory.deploy(await uniswapFactory.getAddress(), await uniswapRouter.getAddress());
            await wrapper.waitForDeployment();
            expect(await wrapper.UNISWAP_V2_FACTORY()).to.equal(await uniswapFactory.getAddress());
            expect(await wrapper.UNISWAP_V2_ROUTER()).to.equal(await uniswapRouter.getAddress());
        });
    });

    describe("createPool", function () {
        const amount0 = ethers.parseEther("1000");
        const amount1 = ethers.parseEther("1000");

        beforeEach(async function () {
            // Mint tokens to PoolWrapper
            await token0.mint(await poolWrapper.getAddress(), amount0);
            await token1.mint(await poolWrapper.getAddress(), amount1);
        });

        it("should revert if token0 is zero address", async function () {
            const createPoolMsg = {
                token0: ethers.ZeroAddress,
                token1: await token1.getAddress(),
                amount0,
                amount1
            };

            await expect(
                poolWrapper.createPool(createPoolMsg)
            ).to.be.revertedWithCustomError(poolWrapper, "InvalidAddress");
        });
        it("should revert if token1 is zero address", async function () {
            const createPoolMsg = {
                token0: await token0.getAddress(),
                token1: ethers.ZeroAddress,
                amount0,
                amount1
            };

            await expect(
                poolWrapper.createPool(createPoolMsg)
            ).to.be.revertedWithCustomError(poolWrapper, "InvalidAddress");
        });
        it("should revert if token0 == token1", async function () {
            const createPoolMsg = {
                token0: await token0.getAddress(),
                token1: await token0.getAddress(),
                amount0,
                amount1
            };

            await expect(
                poolWrapper.createPool(createPoolMsg)
            ).to.be.revertedWithCustomError(poolWrapper, "DifferentTokensRequired");
        });
        it("should revert if amount0 is zero", async function () {
            const createPoolMsg = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                amount0: 0n,
                amount1
            };

            await expect(
                poolWrapper.createPool(createPoolMsg)
            ).to.be.revertedWithCustomError(poolWrapper, "InvalidAmount");
        });
        it("should revert if amount1 is zero", async function () {
            const createPoolMsg = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                amount0,
                amount1: 0n
            };

            await expect(
                poolWrapper.createPool(createPoolMsg)
            ).to.be.revertedWithCustomError(poolWrapper, "InvalidAmount");
        });
        it("should revert if contract has insufficient token0 balance", async function () {
            const createPoolMsg = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                amount0: amount0 + 1n,
                amount1
            };

            await expect(
                poolWrapper.createPool(createPoolMsg)
            ).to.be.revertedWithCustomError(poolWrapper, "InsufficientBalance");
        });
        it("should revert if contract has insufficient token1 balance", async function () {
            const createPoolMsg = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                amount0,
                amount1: amount1 + 1n
            };

            await expect(
                poolWrapper.createPool(createPoolMsg)
            ).to.be.revertedWithCustomError(poolWrapper, "InsufficientBalance");
        });
        it("should create pool and emit event", async function () {
            const createPoolMsg = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                amount0,
                amount1
            };

            // Execute the transaction first
            const tx = await poolWrapper.createPool(createPoolMsg);

            // Get the pool address after the transaction is executed
            const poolAddress = await uniswapFactory.getPair(await token0.getAddress(), await token1.getAddress());

            // Check the event from the transaction receipt
            await expect(tx)
                .to.emit(poolWrapper, "PoolCreated")
                .withArgs(
                    owner.address,
                    poolAddress,
                    await poolWrapper.getAddress(),
                    await token0.getAddress(),
                    await token1.getAddress(),
                    amount0,
                    amount1
                );

            const poolInfo = await poolWrapper.getPoolInfo(owner.address);

            expect(poolInfo.poolAddress).to.equal(poolAddress);
            expect(poolInfo.token0).to.equal(await token0.getAddress());
            expect(poolInfo.token1).to.equal(await token1.getAddress());
        });
        it("should return correct pool info for unknown stream", async function () {
            const info = await poolWrapper.getPoolInfo(other.address);
            expect(info.poolAddress).to.equal(ethers.ZeroAddress);
            expect(info.token0).to.equal(ethers.ZeroAddress);
            expect(info.token1).to.equal(ethers.ZeroAddress);
        });
        it("should use existing pool if already created", async function () {
            const createPoolMsg = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                amount0,
                amount1
            };

            // Create pool first time
            await poolWrapper.createPool(createPoolMsg);
            const firstPoolAddress = await uniswapFactory.getPair(await token0.getAddress(), await token1.getAddress());

            // Mint more tokens for second creation
            await token0.mint(await poolWrapper.getAddress(), amount0);
            await token1.mint(await poolWrapper.getAddress(), amount1);

            // Create pool second time (should use existing pool)
            await poolWrapper.connect(other).createPool(createPoolMsg);
            const secondPoolAddress = await uniswapFactory.getPair(await token0.getAddress(), await token1.getAddress());

            expect(firstPoolAddress).to.equal(secondPoolAddress);
        });
    });

    describe("getPoolInfo", function () {
        it("should return correct pool info for existing stream", async function () {
            const amount0 = ethers.parseEther("1000");
            const amount1 = ethers.parseEther("1000");

            // Mint tokens to PoolWrapper
            await token0.mint(await poolWrapper.getAddress(), amount0);
            await token1.mint(await poolWrapper.getAddress(), amount1);

            const createPoolMsg = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                amount0,
                amount1
            };

            await poolWrapper.createPool(createPoolMsg);

            const poolInfo = await poolWrapper.getPoolInfo(owner.address);
            expect(poolInfo.poolAddress).to.equal(await uniswapFactory.getPair(await token0.getAddress(), await token1.getAddress()));
            expect(poolInfo.token0).to.equal(await token0.getAddress());
            expect(poolInfo.token1).to.equal(await token1.getAddress());
        });
    });

    describe("Ownable functions", function () {
        it("should have correct owner", async function () {
            expect(await poolWrapper.owner()).to.equal(owner.address);
        });

        it("should allow owner to renounce ownership", async function () {
            await poolWrapper.renounceOwnership();
            expect(await poolWrapper.owner()).to.equal(ethers.ZeroAddress);
        });

        it("should allow owner to transfer ownership", async function () {
            await poolWrapper.transferOwnership(other.address);
            expect(await poolWrapper.owner()).to.equal(other.address);
        });

        it("should revert if non-owner tries to renounce ownership", async function () {
            await expect(
                poolWrapper.connect(other).renounceOwnership()
            ).to.be.reverted;
        });

        it("should revert if non-owner tries to transfer ownership", async function () {
            await expect(
                poolWrapper.connect(other).transferOwnership(other.address)
            ).to.be.reverted;
        });
    });
}); 