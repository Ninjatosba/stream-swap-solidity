// import { expect } from "chai";
// import { ethers } from "hardhat";
// import { time } from "@nomicfoundation/hardhat-network-helpers";
// import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// describe("Stream Internal Functions", function () {
//     let streamTest: any;
//     let accounts: {
//         deployer: SignerWithAddress;
//         subscriber1: SignerWithAddress;
//         subscriber2: SignerWithAddress;
//     };
//     let erc20Mock: any;
//     let outDenomMock: any;

//     // Test configuration
//     const config = {
//         streamOutAmount: ethers.parseEther("1000"),
//         threshold: ethers.parseEther("500"),
//         name: "Test Stream",
//     };

//     before(async function () {
//         const signers = await ethers.getSigners();
//         accounts = {
//             deployer: signers[0],
//             subscriber1: signers[1],
//             subscriber2: signers[2],
//         };

//         // Deploy mock tokens
//         const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
//         erc20Mock = await ERC20Mock.deploy("Mock Token", "MTK");
//         await erc20Mock.waitForDeployment();

//         outDenomMock = await ERC20Mock.deploy("Out Token", "OUT");
//         await outDenomMock.waitForDeployment();

//         // Mint tokens to accounts
//         await erc20Mock.mint(accounts.subscriber1.address, ethers.parseEther("1000"));
//         await erc20Mock.mint(accounts.subscriber2.address, ethers.parseEther("1000"));
//         await outDenomMock.mint(accounts.deployer.address, config.streamOutAmount);
//     });

//     beforeEach(async function () {
//         // Get current timestamp
//         const currentTimestamp = await time.latest();

//         // Set up time parameters
//         const bootstrappingStartTime = currentTimestamp + 60; // 1 minute from now
//         const streamStartTime = bootstrappingStartTime + 120; // 2 minutes after bootstrapping starts
//         const streamEndTime = streamStartTime + 300; // 5 minutes after stream starts

//         // Deploy StreamTest contract
//         const StreamTest = await ethers.getContractFactory("StreamTest");

//         // Transfer out tokens to the deployer for the stream
//         await outDenomMock.approve(accounts.deployer.address, config.streamOutAmount);

//         streamTest = await StreamTest.deploy(
//             config.streamOutAmount,
//             outDenomMock.address,
//             bootstrappingStartTime,
//             streamStartTime,
//             streamEndTime,
//             config.threshold,
//             config.name,
//             erc20Mock.address,
//             accounts.deployer.address
//         );

//         // Wait for deployment
//         await streamTest.waitForDeployment();

//         // Transfer out tokens to the stream contract
//         await outDenomMock.transfer(streamTest.address, config.streamOutAmount);
//     });

//     describe("validateStreamTimes", function () {
//         it("should validate correct stream times", async function () {
//             const currentTimestamp = await time.latest();
//             const bootstrappingStartTime = currentTimestamp + 60;
//             const streamStartTime = bootstrappingStartTime + 120;
//             const streamEndTime = streamStartTime + 300;

//             // This should not revert
//             await streamTest.test_validateStreamTimes(
//                 currentTimestamp,
//                 bootstrappingStartTime,
//                 streamStartTime,
//                 streamEndTime
//             );
//         });

//         it("should revert with invalid bootstrapping start time", async function () {
//             const currentTimestamp = await time.latest();
//             const bootstrappingStartTime = currentTimestamp - 10; // In the past
//             const streamStartTime = bootstrappingStartTime + 120;
//             const streamEndTime = streamStartTime + 300;

//             await expect(
//                 streamTest.test_validateStreamTimes(
//                     currentTimestamp,
//                     bootstrappingStartTime,
//                     streamStartTime,
//                     streamEndTime
//                 )
//             ).to.be.revertedWith("InvalidBootstrappingStartTime");
//         });
//     });

//     describe("computeSharesAmount", function () {
//         it("should compute shares amount correctly when shares are 0", async function () {
//             const amountIn = ethers.parseEther("100");
//             const result = await streamTest.test_computeSharesAmount(amountIn, false);
//             expect(result).to.equal(amountIn);
//         });

//         // Add more tests for computeSharesAmount
//     });

//     describe("calculateDiff", function () {
//         it("should return 0 when stream has not started", async function () {
//             const diff = await streamTest.test_calculateDiff();
//             expect(diff).to.equal(0);
//         });

//         // Add more tests for calculateDiff with different stream states
//     });

//     // Add more test cases for other internal functions
// }); 