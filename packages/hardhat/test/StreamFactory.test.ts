import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { streamFactory } from "./helpers/StreamFactoryFixtureBuilder";

describe("StreamFactory", function () {
    describe("Admin Functions", function () {
        it("should allow admin to update fee collector", async function () {
            const { factory, protocolAdmin } = await loadFixture(streamFactory().build());
            const newFeeCollector = ethers.Wallet.createRandom().address;

            await expect(factory.connect(protocolAdmin).updateFeeCollector(newFeeCollector))
                .to.emit(factory, "FeeCollectorUpdated")
                .withArgs(await factory.getAddress(), newFeeCollector);

            const params = await factory.getParams();
            expect(params.feeCollector).to.equal(newFeeCollector);
        });

        it("should not allow non-admin to update fee collector", async function () {
            const { factory, owner } = await loadFixture(streamFactory().build());
            const newFeeCollector = ethers.Wallet.createRandom().address;

            await expect(factory.connect(owner).updateFeeCollector(newFeeCollector))
                .to.be.revertedWithCustomError(factory, "NotAdmin");
        });

        it("should allow admin to update protocol parameters", async function () {
            const { factory, protocolAdmin } = await loadFixture(streamFactory().build());

            await expect(factory.connect(protocolAdmin).updateParams(
                200, // new creation fee
                { value: 150000 }, // new exit fee ratio
                3600, // new min waiting
                7200, // new min bootstrapping
                14400, // new min stream duration
                "2.0" // new TOS version
            )).to.emit(factory, "ParamsUpdated");
        });

        it("should allow admin to freeze/unfreeze contract", async function () {
            const { factory, protocolAdmin } = await loadFixture(streamFactory().build());

            await expect(factory.connect(protocolAdmin).setFrozen(true))
                .to.emit(factory, "FrozenStateUpdated")
                .withArgs(await factory.getAddress(), true);

            expect(await factory.frozen()).to.be.true;

            await expect(factory.connect(protocolAdmin).setFrozen(false))
                .to.emit(factory, "FrozenStateUpdated")
                .withArgs(await factory.getAddress(), false);
        });
    });

    describe("Token Management", function () {
        it("should allow admin to update accepted tokens", async function () {
            const { factory, protocolAdmin } = await loadFixture(streamFactory().build());

            const tokensToAdd = [ethers.Wallet.createRandom().address];
            const tokensToRemove: string[] = [];

            await expect(factory.connect(protocolAdmin).updateAcceptedTokens(tokensToAdd, tokensToRemove))
                .to.emit(factory, "AcceptedTokensUpdated")
                .withArgs(await factory.getAddress(), tokensToAdd, tokensToRemove);
        });

        it("should correctly track accepted tokens", async function () {
            const { factory, protocolAdmin } = await loadFixture(streamFactory().build());
            const newToken = ethers.Wallet.createRandom().address;

            // Add token
            await factory.connect(protocolAdmin).updateAcceptedTokens([newToken], []);
            expect(await factory.isAcceptedInSupplyToken(newToken)).to.be.true;

            // Remove token
            await factory.connect(protocolAdmin).updateAcceptedTokens([], [newToken]);
            expect(await factory.isAcceptedInSupplyToken(newToken)).to.be.false;
        });
        it("should not allow non-admin to update accepted tokens", async function () {
            const { factory, owner } = await loadFixture(streamFactory().build());
            const newToken = ethers.Wallet.createRandom().address;

            await expect(factory.connect(owner).updateAcceptedTokens([newToken], [])).to.be.revertedWithCustomError(factory, "NotAdmin");
        });
        it("should remove token from accepted tokens if set", async function () {
            const { factory, protocolAdmin } = await loadFixture(streamFactory().build());
            const acceptedTokens = await factory.getAcceptedInSupplyTokens();
            // Remove accepted tokens
            await factory.connect(protocolAdmin).updateAcceptedTokens([], acceptedTokens);
            const acceptedTokensAfter = await factory.getAcceptedInSupplyTokens();
            expect(acceptedTokensAfter.length).to.equal(0);
        });
    });

    describe("View Functions", function () {
        it("should return correct stream addresses", async function () {
            const { factory } = await loadFixture(streamFactory().build());
            const streams = await factory.getStreams();
            expect(streams).to.be.an('array');
        });

        it("should return correct parameters", async function () {
            const { factory } = await loadFixture(streamFactory().build());
            const params = await factory.getParams();

            expect(params.streamCreationFee).to.not.be.undefined;
            expect(params.exitFeeRatio).to.not.be.undefined;
            expect(params.minWaitingDuration).to.not.be.undefined;
            expect(params.minBootstrappingDuration).to.not.be.undefined;
            expect(params.minStreamDuration).to.not.be.undefined;
            expect(params.feeCollector).to.not.be.undefined;
            expect(params.protocolAdmin).to.not.be.undefined;
            expect(params.tosVersion).to.not.be.undefined;
        });
    });
});
