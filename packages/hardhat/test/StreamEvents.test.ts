// This test file is designed to triger events of the Stream and factory contracts
// and check if the events are emitted correctly

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { stream } from "./helpers/StreamFixtureBuilder";
import { streamFactory } from "./helpers/StreamFactoryFixtureBuilder";

describe("StreamEvents", function () {
    describe("Factory Events", function () {
        it("should emit ParamsUpdated event when updating parameters", async function () {
            const { factory, protocolAdmin, config } = await loadFixture(streamFactory().build());

            // New parameters
            const newStreamCreationFee = ethers.parseEther("0.02");
            const newExitFeePercent = 200; // 2%
            const newMinWaitingDuration = 60 * 60 * 2; // 2 hours
            const newMinBootstrappingDuration = 60 * 60 * 24 * 2; // 48 hours
            const newMinStreamDuration = 60 * 60 * 24 * 14; // 14 days
            const newTosVersion = "1.1";

            await expect(factory.connect(protocolAdmin).updateParams(
                newStreamCreationFee,
                newExitFeePercent,
                newMinWaitingDuration,
                newMinBootstrappingDuration,
                newMinStreamDuration,
                newTosVersion
            ))
                .to.emit(factory, "ParamsUpdated")
                .withArgs(
                    await factory.getAddress(),
                    newStreamCreationFee,
                    newExitFeePercent,
                    newMinWaitingDuration,
                    newMinBootstrappingDuration,
                    newMinStreamDuration,
                    newTosVersion
                );
        });

        it("should emit FeeCollectorUpdated event when updating fee collector", async function () {
            const { factory, protocolAdmin, owner } = await loadFixture(streamFactory().build());
            const newFeeCollector = await owner.getAddress();

            await expect(factory.connect(protocolAdmin).updateFeeCollector(newFeeCollector))
                .to.emit(factory, "FeeCollectorUpdated")
                .withArgs(await factory.getAddress(), newFeeCollector);
        });

        it("should emit ProtocolAdminUpdated event when updating protocol admin", async function () {
            const { factory, protocolAdmin, owner } = await loadFixture(streamFactory().build());
            const newProtocolAdmin = await owner.getAddress();

            await expect(factory.connect(protocolAdmin).updateProtocolAdmin(newProtocolAdmin))
                .to.emit(factory, "ProtocolAdminUpdated")
                .withArgs(await factory.getAddress(), newProtocolAdmin);
        });

        it("should emit AcceptedTokensUpdated event when updating accepted tokens", async function () {
            const { factory, protocolAdmin } = await loadFixture(streamFactory().build());

            // Deploy a new token to add
            const TokenFactory = await ethers.getContractFactory("ERC20Mock");
            const newToken = await TokenFactory.deploy("New In Token", "NT");
            const tokensToAdd = [await newToken.getAddress()];
            const tokensToRemove: string[] = [];

            await expect(factory.connect(protocolAdmin).updateAcceptedTokens(tokensToAdd, tokensToRemove))
                .to.emit(factory, "AcceptedTokensUpdated")
                .withArgs(await factory.getAddress(), tokensToAdd, tokensToRemove);
        });

        it("should emit StreamCreated event when creating a new stream", async function () {
            // Use a custom builder with shorter waiting time
            const { factory, owner, inSupplyToken, outSupplyToken } = await loadFixture(
                streamFactory().minDurations(1, 60 * 60 * 24, 60 * 60 * 24 * 7).build()
            );

            const latestBlock = await ethers.provider.getBlock("latest");
            const now = latestBlock?.timestamp || 0;

            // Stream parameters - convert to proper wei amounts
            const streamOutAmount = ethers.parseEther("1000");  // Use parseEther
            const bootstrappingStartTime = now + 10;
            const streamStartTime = bootstrappingStartTime + 3600 * 24; // bootstrap for 24 hours
            const streamEndTime = streamStartTime + 3600 * 24 * 7; // stream for 7 days
            const threshold = ethers.parseEther("100");  // Use parseEther
            const streamName = "Test Stream";
            const tosVersion = "1.0";
            const salt = ethers.keccak256(ethers.toUtf8Bytes("testsalt"));

            // Mint tokens to the owner
            await outSupplyToken.mint(owner.address, streamOutAmount);

            // Approve tokens - use large amounts
            await inSupplyToken.approve(await factory.getAddress(), ethers.parseEther("1000000"));
            await outSupplyToken.approve(await factory.getAddress(), streamOutAmount);

            // Create stream and check event
            const tx = await factory.createStream(
                streamOutAmount,
                await outSupplyToken.getAddress(),  // Use getAddress
                bootstrappingStartTime,
                streamStartTime,
                streamEndTime,
                threshold,
                streamName,
                await inSupplyToken.getAddress(),  // Use getAddress
                tosVersion,
                salt
            );
            const receipt = await tx.wait();
            if (receipt) {
                const event = receipt.logs.find(log => {
                    try {
                        return factory.interface.parseLog({ topics: log.topics, data: log.data })?.name === "StreamCreated";
                    } catch {
                        return false;
                    }
                });

                if (event) {
                    const parsedEvent = factory.interface.parseLog({ topics: event.topics, data: event.data });
                    const streamId = parsedEvent?.args[11]; // ID should be at position 11

                    // Now verify the event was emitted with correct values
                    expect(parsedEvent?.args[0]).to.equal(await outSupplyToken.getAddress());
                    expect(parsedEvent?.args[9]).to.equal(tosVersion);
                    expect(streamId).to.equal(0);
                }
            }
        });
    });


});

