import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenFactory } from "../typechain-types";
import { StandardERC20 } from "../typechain-types";

describe("TokenFactory", function () {
    let tokenFactory: TokenFactory;
    let owner: any;
    let user1: any;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();

        const TokenFactoryFactory = await ethers.getContractFactory("TokenFactory");
        tokenFactory = await TokenFactoryFactory.deploy();
    });

    describe("createToken", function () {
        it("Should create a standard ERC20 token with custom decimals", async function () {
            const tokenInfo = {
                name: "Test Token",
                symbol: "TEST",
                decimals: 6, // Like USDC
                totalSupply: ethers.parseUnits("1000000", 6), // 1M tokens with 6 decimals
                initialOwner: owner.address,
                isMintable: false,
                isBurnable: false
            };

            const recipients = [owner.address];
            const amounts = [ethers.parseUnits("1000000", 6)];

            const tx = await tokenFactory.createToken(tokenInfo, recipients, amounts);
            const receipt = await tx.wait();

            // Get the token address from the event
            const event = receipt?.logs.find(log => {
                try {
                    const parsed = tokenFactory.interface.parseLog(log);
                    return parsed?.name === "TokenCreated";
                } catch {
                    return false;
                }
            });

            expect(event).to.not.be.undefined;
            const parsedEvent = tokenFactory.interface.parseLog(event!);
            const tokenAddress = parsedEvent?.args.token;

            // Verify token properties
            const token = await ethers.getContractAt("StandardERC20", tokenAddress);
            expect(await token.name()).to.equal("Test Token");
            expect(await token.symbol()).to.equal("TEST");
            expect(await token.decimals()).to.equal(6);
            expect(await token.totalSupply()).to.equal(ethers.parseUnits("1000000", 6));
            expect(await token.balanceOf(owner.address)).to.equal(ethers.parseUnits("1000000", 6));
        });

        it("Should create token with 18 decimals (standard)", async function () {
            const tokenInfo = {
                name: "Standard Token",
                symbol: "STD",
                decimals: 18,
                totalSupply: ethers.parseEther("1000000"), // 1M tokens
                initialOwner: owner.address,
                isMintable: false,
                isBurnable: false
            };

            const recipients = [owner.address];
            const amounts = [ethers.parseEther("1000000")];

            const tx = await tokenFactory.createToken(tokenInfo, recipients, amounts);
            const receipt = await tx.wait();

            const event = receipt?.logs.find(log => {
                try {
                    const parsed = tokenFactory.interface.parseLog(log);
                    return parsed?.name === "TokenCreated";
                } catch {
                    return false;
                }
            });

            const parsedEvent = tokenFactory.interface.parseLog(event!);
            const tokenAddress = parsedEvent?.args.token;

            const token = await ethers.getContractAt("StandardERC20", tokenAddress);
            expect(await token.decimals()).to.equal(18);
            expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000"));
        });
    });

    it("Should create token and split initial supply", async function () {
        const tokenInfo = {
            name: "Split Token",
            symbol: "SPLIT",
            decimals: 18,
            totalSupply: ethers.parseEther("1000000"),
            initialOwner: owner.address,
            isMintable: false,
            isBurnable: false
        };

        const fundAmount = ethers.parseEther("300000"); // 300k to stream
        const remainderAmount = ethers.parseEther("700000"); // 700k to remainder owner

        const recipients = [user1.address, owner.address];
        const amounts = [fundAmount, remainderAmount];

        const tx = await tokenFactory.createToken(tokenInfo, recipients, amounts);
        const receipt = await tx.wait();

        const event = receipt?.logs.find(log => {
            try {
                const parsed = tokenFactory.interface.parseLog(log);
                return parsed?.name === "TokenCreated";
            } catch {
                return false;
            }
        });

        const parsedEvent = tokenFactory.interface.parseLog(event!);
        const tokenAddress = parsedEvent?.args.token;

        const token = await ethers.getContractAt("StandardERC20", tokenAddress);
        expect(await token.balanceOf(user1.address)).to.equal(fundAmount);
        expect(await token.balanceOf(owner.address)).to.equal(remainderAmount);
        expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000"));
    });
});
