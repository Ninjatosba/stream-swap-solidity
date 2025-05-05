import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { streamFactory } from "./helpers/StreamFactoryFixtureBuilder";

describe("StreamFactory", function () {
    describe("Admin Functions", function () {
        it("should allow admin to update fee collector", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const newFeeCollector = ethers.Wallet.createRandom().address;

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateFeeCollector(newFeeCollector))
                .to.emit(fixture.contracts.streamFactory, "FeeCollectorUpdated")
                .withArgs(await fixture.contracts.streamFactory.getAddress(), newFeeCollector);

            const params = await fixture.contracts.streamFactory.getParams();
            expect(params.feeCollector).to.equal(newFeeCollector);
        });

        it("should not allow non-admin to update fee collector", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const newFeeCollector = ethers.Wallet.createRandom().address;

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateFeeCollector(newFeeCollector))
                .to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
        });

        it("should allow admin to update protocol parameters", async function () {
            const fixture = await loadFixture(streamFactory().build());

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateParams(
                200, // new creation fee
                { value: 150000n }, // new exit fee ratio
                3600, // new min waiting
                7200, // new min bootstrapping
                14400, // new min stream duration
                "2.0" // new TOS version
            )).to.emit(fixture.contracts.streamFactory, "ParamsUpdated");
        });

        it("should allow admin to freeze/unfreeze contract", async function () {
            const fixture = await loadFixture(streamFactory().build());

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).setFrozen(true))
                .to.emit(fixture.contracts.streamFactory, "FrozenStateUpdated")
                .withArgs(await fixture.contracts.streamFactory.getAddress(), true);

            expect(await fixture.contracts.streamFactory.frozen()).to.be.true;

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).setFrozen(false))
                .to.emit(fixture.contracts.streamFactory, "FrozenStateUpdated")
                .withArgs(await fixture.contracts.streamFactory.getAddress(), false);
        });
    });

    describe("Token Management", function () {
        it("should allow admin to update accepted tokens", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const tokensToAdd = [ethers.Wallet.createRandom().address];
            const tokensToRemove: string[] = [];

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateAcceptedTokens(tokensToAdd, tokensToRemove))
                .to.emit(fixture.contracts.streamFactory, "AcceptedTokensUpdated")
                .withArgs(await fixture.contracts.streamFactory.getAddress(), tokensToAdd, tokensToRemove);
        });

        it("should correctly track accepted tokens", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const newToken = ethers.Wallet.createRandom().address;

            // Add token
            await fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateAcceptedTokens([newToken], []);
            expect(await fixture.contracts.streamFactory.isAcceptedInSupplyToken(newToken)).to.be.true;

            // Remove token
            await fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateAcceptedTokens([], [newToken]);
            expect(await fixture.contracts.streamFactory.isAcceptedInSupplyToken(newToken)).to.be.false;
        });

        it("should not allow non-admin to update accepted tokens", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const newToken = ethers.Wallet.createRandom().address;

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateAcceptedTokens([newToken], []))
                .to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
        });

        it("should remove token from accepted tokens if set", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const acceptedTokens = await fixture.contracts.streamFactory.getAcceptedInSupplyTokens();
            // Remove accepted tokens
            await fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateAcceptedTokens([], acceptedTokens);
            const acceptedTokensAfter = await fixture.contracts.streamFactory.getAcceptedInSupplyTokens();
            expect(acceptedTokensAfter.length).to.equal(0);
        });
    });

    describe("View Functions", function () {
        it("should return correct stream addresses", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const streams = await fixture.contracts.streamFactory.getStreams();
            expect(streams).to.be.an('array');
        });

        it("should return correct parameters", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const params = await fixture.contracts.streamFactory.getParams();

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
