import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { streamFactory } from "../helpers/StreamFactoryFixtureBuilder";

describe("StreamFactoryManagement", function () {
    describe("Individual Parameter Updates", function () {
        describe("updateStreamFeeParameters", function () {
            it("should allow admin to update stream fee parameters", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const params = await fixture.contracts.streamFactory.getParams();
                const newFee = 500;
                const newToken = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateStreamFeeParameters(newFee, newToken),
                )
                    .to.emit(fixture.contracts.streamFactory, "StreamFeeParametersUpdated")
                    .withArgs(
                        await fixture.contracts.streamFactory.getAddress(),
                        params.streamCreationFee,
                        newFee,
                        params.streamCreationFeeToken,
                        newToken
                    );

                const updatedParams = await fixture.contracts.streamFactory.getParams();
                expect(updatedParams.streamCreationFee).to.equal(newFee);
                expect(updatedParams.streamCreationFeeToken).to.equal(newToken);
            });

            it("should allow zero address as fee token for native token support", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const params = await fixture.contracts.streamFactory.getParams();
                const newFee = 500;

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateStreamFeeParameters(newFee, ethers.ZeroAddress),
                ).to.not.be.reverted;
            });

            it("should not allow non-admin to update fee parameters", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newFee = 500;
                const newToken = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.creator)
                        .updateStreamFeeParameters(newFee, newToken),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateExitFeeRatio", function () {
            it("should allow admin to update exit fee ratio", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const params = await fixture.contracts.streamFactory.getParams();
                const newRatio = { value: 200000n }; // 20%

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateExitFeeRatio(newRatio),
                )
                    .to.emit(fixture.contracts.streamFactory, "ExitFeeRatioUpdated")
                    .withArgs(await fixture.contracts.streamFactory.getAddress(), params.exitFeeRatio.value, newRatio.value);

                const updatedParams = await fixture.contracts.streamFactory.getParams();
                expect(updatedParams.exitFeeRatio.value).to.equal(newRatio.value);
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

        describe("updateTimingParameters", function () {
            it("should allow admin to update timing parameters", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const params = await fixture.contracts.streamFactory.getParams();
                const newWaiting = 7200; // 2 hours
                const newBootstrapping = 10800; // 3 hours
                const newStream = 14400; // 4 hours

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateTimingParameters(newWaiting, newBootstrapping, newStream),
                )
                    .to.emit(fixture.contracts.streamFactory, "TimingParametersUpdated")
                    .withArgs(
                        await fixture.contracts.streamFactory.getAddress(),
                        params.minWaitingDuration,
                        newWaiting,
                        params.minBootstrappingDuration,
                        newBootstrapping,
                        params.minStreamDuration,
                        newStream
                    );

                const updatedParams = await fixture.contracts.streamFactory.getParams();
                expect(updatedParams.minWaitingDuration).to.equal(newWaiting);
                expect(updatedParams.minBootstrappingDuration).to.equal(newBootstrapping);
                expect(updatedParams.minStreamDuration).to.equal(newStream);
            });

            it("should not allow non-admin to update timing parameters", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newWaiting = 7200;
                const newBootstrapping = 10800;
                const newStream = 14400;

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.creator)
                        .updateTimingParameters(newWaiting, newBootstrapping, newStream),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateTosVersion", function () {
            it("should allow admin to update TOS version", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const params = await fixture.contracts.streamFactory.getParams();
                const newVersion = "2.0";

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateTosVersion(newVersion),
                )
                    .to.emit(fixture.contracts.streamFactory, "TosVersionUpdated")
                    .withArgs(await fixture.contracts.streamFactory.getAddress(), params.tosVersion, newVersion);

                const updatedParams = await fixture.contracts.streamFactory.getParams();
                expect(updatedParams.tosVersion).to.equal(newVersion);
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
                const params = await fixture.contracts.streamFactory.getParams();
                const newFeeCollector = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateFeeCollector(newFeeCollector),
                )
                    .to.emit(fixture.contracts.streamFactory, "FeeCollectorUpdated")
                    .withArgs(await fixture.contracts.streamFactory.getAddress(), params.feeCollector, newFeeCollector);

                const updatedParams = await fixture.contracts.streamFactory.getParams();
                expect(updatedParams.feeCollector).to.equal(newFeeCollector);
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
                const params = await fixture.contracts.streamFactory.getParams();
                const newAdmin = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory.connect(fixture.accounts.protocolAdmin).updateProtocolAdmin(newAdmin),
                )
                    .to.emit(fixture.contracts.streamFactory, "ProtocolAdminUpdated")
                    .withArgs(await fixture.contracts.streamFactory.getAddress(), params.protocolAdmin, newAdmin);

                const updatedParams = await fixture.contracts.streamFactory.getParams();
                expect(updatedParams.protocolAdmin).to.equal(newAdmin);
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

        describe("updatePoolParameters", function () {
            it("should allow admin to update pool router address", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const params = await fixture.contracts.streamFactory.getParams();
                const newRouter = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updatePoolRouterAddress(newRouter),
                )
                    .to.emit(fixture.contracts.streamFactory, "PoolRouterUpdated")
                    .withArgs(await fixture.contracts.streamFactory.getAddress(), params.poolRouterAddress, newRouter);

                const updatedParams = await fixture.contracts.streamFactory.getParams();
                expect(updatedParams.poolRouterAddress).to.equal(newRouter);
            });

            it("should allow zero address as pool router", async function () {
                const fixture = await loadFixture(streamFactory().build());

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updatePoolRouterAddress(ethers.ZeroAddress),
                ).to.not.be.reverted; // zero address allowed
            });

            it("should not allow non-admin to update pool router", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const newRouter = ethers.Wallet.createRandom().address;

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.creator)
                        .updatePoolRouterAddress(newRouter),
                ).to.be.revertedWithCustomError(fixture.contracts.streamFactory, "NotAdmin");
            });
        });

        describe("updateImplementationParameters", function () {
            it("should allow admin to update implementation parameters", async function () {
                const fixture = await loadFixture(streamFactory().build());
                const params = await fixture.contracts.streamFactory.getParams();

                const StreamBasicFactory = await ethers.getContractFactory("StreamBasic");
                const StreamPostActionsFactory = await ethers.getContractFactory("StreamPostActions");

                const newBasic = await StreamBasicFactory.deploy();
                const newPostActions = await StreamPostActionsFactory.deploy();

                await Promise.all([
                    newBasic.waitForDeployment(),
                    newPostActions.waitForDeployment()
                ]);

                const newBasicAddress = await newBasic.getAddress();
                const newPostActionsAddress = await newPostActions.getAddress();

                const oldBasic = await fixture.contracts.streamFactory.getImplementation(0);
                const oldPostActions = await fixture.contracts.streamFactory.getImplementation(1);

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateImplementationParameters(
                            newBasicAddress,
                            newPostActionsAddress,
                        ),
                )
                    .to.emit(fixture.contracts.streamFactory, "ImplementationParametersUpdated")
                    .withArgs(
                        await fixture.contracts.streamFactory.getAddress(),
                        oldBasic,
                        newBasicAddress,
                        oldPostActions,
                        newPostActionsAddress,
                    );

                expect(await fixture.contracts.streamFactory.getImplementation(0)).to.equal(newBasicAddress);
                expect(await fixture.contracts.streamFactory.getImplementation(1)).to.equal(newPostActionsAddress);
            });

            it("should allow zero address as implementation", async function () {
                const fixture = await loadFixture(streamFactory().build());

                const StreamBasicFactory = await ethers.getContractFactory("StreamBasic");
                const StreamPostActionsFactory = await ethers.getContractFactory("StreamPostActions");

                const newBasic = await StreamBasicFactory.deploy();
                const newPostActions = await StreamPostActionsFactory.deploy();

                await Promise.all([
                    newBasic.waitForDeployment(),
                    newPostActions.waitForDeployment()
                ]);

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.protocolAdmin)
                        .updateImplementationParameters(
                            await newBasic.getAddress(),
                            ethers.ZeroAddress,
                        ),
                ).to.not.be.reverted;
            });

            it("should not allow non-admin to update implementation parameters", async function () {
                const fixture = await loadFixture(streamFactory().build());

                const StreamBasicFactory = await ethers.getContractFactory("StreamBasic");
                const StreamPostActionsFactory = await ethers.getContractFactory("StreamPostActions");

                const newBasic = await StreamBasicFactory.deploy();
                const newPostActions = await StreamPostActionsFactory.deploy();

                await Promise.all([
                    newBasic.waitForDeployment(),
                    newPostActions.waitForDeployment()
                ]);

                await expect(
                    fixture.contracts.streamFactory
                        .connect(fixture.accounts.creator)
                        .updateImplementationParameters(
                            await newBasic.getAddress(),
                            await newPostActions.getAddress(),
                        ),
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