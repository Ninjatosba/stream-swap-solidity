import { expect } from "chai";
import { ethers } from "hardhat";
import { Stream, StreamFactory, ERC20Mock } from "../typechain-types";
import { streamFactory } from "./helpers/StreamFactoryFixtureBuilder";
import { StreamTypes } from "../typechain-types/contracts/Stream";

describe("Stream Indexer Tests", function () {
    let factory: StreamFactory;
    let accounts: {
        creator: any;
        protocolAdmin: any;
        feeCollector: any;
    };
    let tokens: {
        inSupplyToken: any;
        outSupplyToken: any;
    };

    before(async function () {
        // Use factory fixture with minimum durations
        const deployment = await streamFactory()
            .build()();

        factory = deployment.contracts.streamFactory;
        accounts = {
            creator: deployment.accounts.creator,
            protocolAdmin: deployment.accounts.protocolAdmin,
            feeCollector: deployment.accounts.feeCollector
        };
        tokens = {
            inSupplyToken: deployment.contracts.inSupplyToken,
            outSupplyToken: deployment.contracts.outSupplyToken
        };

        console.log("Factory address:", await factory.getAddress());
    });

    describe("Factory Indexing", function () {
        it("should index parameter updates", async function () {
            // New parameters
            const newStreamCreationFee = 0
            const newExitFeeRatio = {
                value: 2000 // 2%
            };
            const newMinWaitingDuration = 2;
            const newMinBootstrappingDuration = 2;
            const newMinStreamDuration = 2;
            const newTosVersion = "1.1";

            await factory.connect(accounts.protocolAdmin).updateParams(
                newStreamCreationFee,
                newExitFeeRatio,
                newMinWaitingDuration,
                newMinBootstrappingDuration,
                newMinStreamDuration,
                newTosVersion
            );
        });

        it("should index fee collector updates", async function () {
            const newFeeCollector = await accounts.feeCollector.getAddress();

            await factory.connect(accounts.protocolAdmin).updateFeeCollector(newFeeCollector);

        });

        it("should index accepted tokens updates", async function () {
            // Deploy a new token
            const TokenFactory = await ethers.getContractFactory("ERC20Mock");
            const newToken = await TokenFactory.deploy("New In Token", "NT");
            const tokensToAdd = [await newToken.getAddress()];
            const tokensToRemove: string[] = [];

            await factory.connect(accounts.protocolAdmin).updateAcceptedTokens(tokensToAdd, tokensToRemove);

        });

        it("should index stream creation", async function () {
            const latestBlock = await ethers.provider.getBlock("latest");
            const now = latestBlock?.timestamp || 0;

            // Calculate times like in StreamEvents.test.ts
            const bootstrappingStartTime = now + 10;
            const streamStartTime = bootstrappingStartTime + 3600 * 24; // bootstrap for 24 hours
            const streamEndTime = streamStartTime + 3600 * 24 * 7; // stream for 7 days

            // Convert amounts to proper wei values
            const streamOutAmount = ethers.parseEther("1000"); // Convert to wei
            const threshold = ethers.parseEther("100"); // Convert to wei
            const tosVersion = "1.1";
            const salt = ethers.keccak256(ethers.toUtf8Bytes("testsalt"));

            // Mint tokens to the creator if needed
            await tokens.outSupplyToken.mint(accounts.creator.address, streamOutAmount);

            // approve tokens - use the exact streamOutAmount
            await tokens.outSupplyToken.connect(accounts.creator).approve(
                await factory.getAddress(),
                streamOutAmount
            );

            // Create stream
            const createStreamMessage: StreamTypes.CreateStreamMessageStruct = {
                streamOutAmount,
                outSupplyToken: await tokens.outSupplyToken.getAddress(),
                bootstrappingStartTime,
                streamStartTime,
                streamEndTime,
                threshold,
                metadata: { ipfsHash: "QmS4ghgMgPXqX53EiQ7sP8G6QY8Y5X53EiQ7sP8G6Q" },
                inSupplyToken: await tokens.inSupplyToken.getAddress(),
                creator: accounts.creator.address,
                creatorVesting: {
                    cliffDuration: 0,
                    vestingDuration: 0,
                    isVestingEnabled: false
                },
                beneficiaryVesting: {
                    cliffDuration: 0,
                    vestingDuration: 0,
                    isVestingEnabled: false
                },
                poolInfo: {
                    poolOutSupplyAmount: 0
                },
                salt,
                tosVersion
            };

            await factory.connect(accounts.creator).createStream(createStreamMessage);

        });
    });
}); 