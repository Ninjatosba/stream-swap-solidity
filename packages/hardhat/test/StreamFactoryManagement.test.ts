import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { streamFactory } from "./helpers/StreamFactoryFixtureBuilder";

describe("StreamFactoryManagement", function () {
    describe("Individual Parameter Updates", function () {
        describe("updateStreamCreationFee", function () {
            it("should allow admin to update stream creation fee", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newFee = 500;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateStreamCreationFee(newFee),
                ).to.emit(fixture.contracts.streamFactory, "ParamsUpdated");

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.streamCreationFee).to.equal(newFee);
            });

            it("should not allow non-admin to update stream creation fee", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newFee = 500;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateStreamCreationFee(newFee),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateStreamCreationFeeToken", function () {
            it("should allow admin to update stream creation fee token", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newToken = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateStreamCreationFeeToken(newToken),
                ).to.emit(fixture.contracts.streamFactory, "ParamsUpdated");

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.streamCreationFeeToken).to.equal(newToken);
            });

            it("should allow zero address as fee token for native token support", async function () {
                const fixture = await loadFixture(streamFactory().build());

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateStreamCreationFeeToken(ethers.ZeroAddress),
                ).to.not.be.reverted;
            });

            it("should not allow non-admin to update fee token", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newToken = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateStreamCreationFeeToken(newToken),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateExitFeeRatio", function () {
            it("should allow admin to update exit fee ratio", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newRatio = { value: 200000n }; // 20%

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateExitFeeRatio(newRatio),
                ).to.emit(fixture.contracts.streamFactory, "ParamsUpdated");

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.exitFeeRatio.value).to.equal(newRatio.value);
            });

            it("should not allow exit fee ratio greater than 100%", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const invalidRatio = { value: 1500000n }; // 150%

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateExitFeeRatio(invalidRatio),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidExitFeeRatio");
            });

            it("should not allow non-admin to update exit fee ratio", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newRatio = { value: 200000n };

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateExitFeeRatio(newRatio),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateMinWaitingDuration", function () {
            it("should allow admin to update min waiting duration", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newDuration = 7200; // 2 hours

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateMinWaitingDuration(newDuration),
                ).to.emit(fixture.contracts.streamFactory, "ParamsUpdated");

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.minWaitingDuration).to.equal(newDuration);
            });

            it("should not allow non-admin to update min waiting duration", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newDuration = 7200;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateMinWaitingDuration(newDuration),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateMinBootstrappingDuration", function () {
            it("should allow admin to update min bootstrapping duration", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newDuration = 10800; // 3 hours

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateMinBootstrappingDuration(newDuration),
                ).to.emit(fixture.contracts.streamFactory, "ParamsUpdated");

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.minBootstrappingDuration).to.equal(newDuration);
            });

            it("should not allow non-admin to update min bootstrapping duration", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newDuration = 10800;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateMinBootstrappingDuration(newDuration),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateMinStreamDuration", function () {
            it("should allow admin to update min stream duration", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newDuration = 14400; // 4 hours

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateMinStreamDuration(newDuration),
                ).to.emit(fixture.contracts.streamFactory, "ParamsUpdated");

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.minStreamDuration).to.equal(newDuration);
            });

            it("should not allow non-admin to update min stream duration", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newDuration = 14400;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateMinStreamDuration(newDuration),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateTosVersion", function () {
            it("should allow admin to update TOS version", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newVersion = "2.0";

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateTosVersion(newVersion),
                ).to.emit(fixture.contracts.streamFactory, "ParamsUpdated");

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.tosVersion).to.equal(newVersion);
            });

            it("should not allow non-admin to update TOS version", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newVersion = "2.0";

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateTosVersion(newVersion),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateFeeCollector", function () {
            it("should allow admin to update fee collector", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newFeeCollector = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateFeeCollector(newFeeCollector),
                )
                    .to.emit(fixture.contracts.streamFactory, "FeeCollectorUpdated")
                    .withArgs(await fixture.contracts.streamFactory.getAddress(), newFeeCollector);

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.feeCollector).to.equal(newFeeCollector);
            });

            it("should not allow zero address as fee collector", async function () {
                const fixture = await loadFixture(streamFactory().build());

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateFeeCollector(ethers.ZeroAddress),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidFeeCollector");
            });

            it("should not allow non-admin to update fee collector", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newFeeCollector = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateFeeCollector(newFeeCollector),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateProtocolAdmin", function () {
            it("should allow admin to update protocol admin", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newAdmin = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateProtocolAdmin(newAdmin),
                )
                    .to.emit(fixture.contracts.streamFactory, "ProtocolAdminUpdated")
                    .withArgs(await fixture.contracts.streamFactory.getAddress(), newAdmin);

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.protocolAdmin).to.equal(newAdmin);
            });

            it("should not allow zero address as protocol admin", async function () {
                const fixture = await loadFixture(streamFactory().build());

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateProtocolAdmin(ethers.ZeroAddress),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidProtocolAdmin");
            });

            it("should not allow non-admin to update protocol admin", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newAdmin = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateProtocolAdmin(newAdmin),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updatePoolWrapper", function () {
            it("should allow admin to update pool wrapper", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const v2PoolWrapper = ethers.Wallet.createRandom().address;
                const v3PoolWrapper = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updatePoolWrapper(v2PoolWrapper, v3PoolWrapper),
                )
                    .to.emit(fixture.contracts.streamFactory, "PoolWrapperUpdated")
                    .withArgs(await fixture.contracts.streamFactory.getAddress(), v2PoolWrapper, v3PoolWrapper);

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.V2PoolWrapperAddress).to.equal(v2PoolWrapper);
                expect(params.V3PoolWrapperAddress).to.equal(v3PoolWrapper);
            });

            it("should not allow zero address as pool wrapper", async function () {
                const fixture = await loadFixture(streamFactory().build());

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updatePoolWrapper(ethers.ZeroAddress, ethers.ZeroAddress),
                ).to.not.be.reverted; // zero addresses are allowed
            });

            it("should not allow non-admin to update pool wrapper", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const v2PoolWrapper = ethers.Wallet.createRandom().address;
                const v3PoolWrapper = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.creator).updatePoolWrapper(v2PoolWrapper, v3PoolWrapper),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateStreamImplementation", function () {
            it("should allow admin to update stream implementation", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newImplementation = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateStreamImplementation(newImplementation),
                ).to.emit(fixture.contracts.streamFactory, "ParamsUpdated");

                const params = await fixture.contracts.streamFactory.getParams();
                expect(params.streamImplementationAddress).to.equal(newImplementation);
            });

            it("should not allow zero address as stream implementation", async function () {
                const fixture = await loadFixture(streamFactory().build());

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateStreamImplementation(ethers.ZeroAddress),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "InvalidImplementationAddress");
            });

            it("should not allow non-admin to update stream implementation", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newImplementation = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.creator)
                        .updateStreamImplementation(newImplementation),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });
    });

    describe("Token Management", function () {
        it("should allow admin to update accepted tokens", async function () {
            const fixture = await loadFixture(streamFactory().build());

            const tokensToAdd = [ethers.Wallet.createRandom().address];
            const tokensToRemove: string[] = [];

            await expect(
                fixture.contracts.streamFactory
                    .connect(fixture.accounts.protocolAdmin)
                    .updateAcceptedTokens(tokensToAdd, tokensToRemove),
            )
                .to.emit(fixture.contracts.streamFactory, "AcceptedTokensUpdated")
                .withArgs(await fixture.contracts.streamFactory.getAddress(), tokensToAdd, tokensToRemove);
        });

        it("should correctly track accepted tokens", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const newToken = ethers.Wallet.createRandom().address;

            // Add token
            await fixture.contracts.streamFactory
                .connect(fixture.accounts.protocolAdmin)
                .updateAcceptedTokens([newToken], []);
            expect(await fixture.contracts.streamFactory.isAcceptedInSupplyToken(newToken)).to.be.true;

            // Remove token
            await fixture.contracts.streamFactory
                .connect(fixture.accounts.protocolAdmin)
                .updateAcceptedTokens([], [newToken]);
            expect(await fixture.contracts.streamFactory.isAcceptedInSupplyToken(newToken)).to.be.false;
        });

        it("should not allow non-admin to update accepted tokens", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const newToken = ethers.Wallet.createRandom().address;

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).updateAcceptedTokens([newToken], []),
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
        });

        it("should handle adding and removing tokens in same transaction", async function () {
            const fixture = await loadFixture(streamFactory().build());
            const tokenToAdd = ethers.Wallet.createRandom().address;
            const tokenToRemove = ethers.Wallet.createRandom().address;

            // First add the token to be removed
            await fixture.contracts.streamFactory
                .connect(fixture.accounts.protocolAdmin)
                .updateAcceptedTokens([tokenToRemove], []);
            expect(await fixture.contracts.streamFactory.isAcceptedInSupplyToken(tokenToRemove)).to.be.true;

            // Now add one and remove the other in same transaction
            await fixture.contracts.streamFactory
                .connect(fixture.accounts.protocolAdmin)
                .updateAcceptedTokens([tokenToAdd], [tokenToRemove]);

            expect(await fixture.contracts.streamFactory.isAcceptedInSupplyToken(tokenToAdd)).to.be.true;
            expect(await fixture.contracts.streamFactory.isAcceptedInSupplyToken(tokenToRemove)).to.be.false;
        });
    });

    describe("Factory Management", function () {
        it("should allow admin to freeze/unfreeze contract", async function () {
            const fixture = await loadFixture(streamFactory().build());

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).setFrozen(true))
                .to.emit(fixture.contracts.streamFactory, "FrozenStateUpdated")
                .withArgs(await fixture.contracts.streamFactory.getAddress(), true);

            expect(await fixture.contracts.streamFactory.frozen()).to.be.true;

            await expect(fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).setFrozen(false))
                .to.emit(fixture.contracts.streamFactory, "FrozenStateUpdated")
                .withArgs(await fixture.contracts.streamFactory.getAddress(), false);

            expect(await fixture.contracts.streamFactory.frozen()).to.be.false;
        });

        it("should not allow non-admin to freeze contract", async function () {
            const fixture = await loadFixture(streamFactory().build());

            await expect(
                fixture.contracts.streamFactory.connect(fixture.accounts.creator).setFrozen(true),
            ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
        });

        it("should handle multiple freeze/unfreeze operations", async function () {
            const fixture = await loadFixture(streamFactory().build());

            // Freeze
            await fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).setFrozen(true);
            expect(await fixture.contracts.streamFactory.frozen()).to.be.true;

            // Freeze again (should still work)
            await fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).setFrozen(true);
            expect(await fixture.contracts.streamFactory.frozen()).to.be.true;

            // Unfreeze
            await fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).setFrozen(false);
            expect(await fixture.contracts.streamFactory.frozen()).to.be.false;

            // Unfreeze again (should still work)
            await fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).setFrozen(false);
            expect(await fixture.contracts.streamFactory.frozen()).to.be.false;
        });
    });
}); 