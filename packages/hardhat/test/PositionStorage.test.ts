import { expect } from "chai";
import { ethers } from "hardhat";
import { PositionStorage } from "../typechain-types";
import { DecimalMath } from "../typechain-types";

describe("PositionStorage", function () {
    let positionStorage: PositionStorage;
    let decimalMath: DecimalMath;
    let owner: any;
    let user1: any;
    let user2: any;
    let streamContract: any;

    beforeEach(async function () {
        [owner, user1, user2, streamContract] = await ethers.getSigners();

        // Deploy DecimalMath first
        const DecimalMathFactory = await ethers.getContractFactory("DecimalMath");
        decimalMath = await DecimalMathFactory.deploy();

        // Deploy PositionStorage with stream contract address
        const PositionStorageFactory = await ethers.getContractFactory("PositionStorage");
        positionStorage = await PositionStorageFactory.deploy(streamContract.address);
    });

    describe("Constructor", function () {
        it("should set the stream contract address correctly", async function () {
            expect(await positionStorage.STREAM_CONTRACT_ADDRESS()).to.equal(streamContract.address);
        });

        it("should revert if stream contract address is zero", async function () {
            const PositionStorageFactory = await ethers.getContractFactory("PositionStorage");
            await expect(
                PositionStorageFactory.deploy(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(positionStorage, "InvalidStreamContractAddress");
        });
    });

    describe("Access Control", function () {
        it("should allow stream contract to call functions", async function () {
            // This should not revert when called by the stream contract
            await expect(
                positionStorage.connect(streamContract).createPosition(
                    user1.address,
                    1000,
                    100,
                    { value: 1000000 }
                )
            ).to.not.be.reverted;
        });

        it("should revert when non-stream contract calls createPosition", async function () {
            await expect(
                positionStorage.connect(user1).createPosition(
                    user1.address,
                    1000,
                    100,
                    { value: 1000000 }
                )
            ).to.be.revertedWithCustomError(positionStorage, "UnauthorizedAccess");
        });

        it("should revert when non-stream contract calls updatePosition", async function () {
            const position = {
                inBalance: 1000,
                shares: 100,
                index: { value: 1000000 },
                lastUpdateTime: Math.floor(Date.now() / 1000),
                pendingReward: { value: 0 },
                spentIn: 0,
                purchased: 0,
                exitDate: 0
            };

            await expect(
                positionStorage.connect(user1).updatePosition(user1.address, position)
            ).to.be.revertedWithCustomError(positionStorage, "UnauthorizedAccess");
        });

        it("should revert when non-stream contract calls setExitDate", async function () {
            await expect(
                positionStorage.connect(user1).setExitDate(user1.address, Math.floor(Date.now() / 1000))
            ).to.be.revertedWithCustomError(positionStorage, "UnauthorizedAccess");
        });
    });

    describe("Position Management", function () {
        beforeEach(async function () {
            // Create a position first
            await positionStorage.connect(streamContract).createPosition(
                user1.address,
                1000,
                100,
                { value: 1000000 }
            );
        });

        it("should create position correctly", async function () {
            const position = await positionStorage.getPosition(user1.address);
            expect(position.inBalance).to.equal(1000);
            expect(position.shares).to.equal(100);
            expect(position.index.value).to.equal(1000000);
            expect(position.exitDate).to.equal(0);
        });

        it("should update position correctly", async function () {
            const updatedPosition = {
                inBalance: 2000,
                shares: 200,
                index: { value: 2000000 },
                lastUpdateTime: Math.floor(Date.now() / 1000),
                pendingReward: { value: 500 },
                spentIn: 500,
                purchased: 100,
                exitDate: 0
            };

            await positionStorage.connect(streamContract).updatePosition(user1.address, updatedPosition);

            const position = await positionStorage.getPosition(user1.address);
            expect(position.inBalance).to.equal(2000);
            expect(position.shares).to.equal(200);
            expect(position.index.value).to.equal(2000000);
            expect(position.spentIn).to.equal(500);
            expect(position.purchased).to.equal(100);
        });

        it("should set exit date correctly", async function () {
            const exitDate = Math.floor(Date.now() / 1000);
            await positionStorage.connect(streamContract).setExitDate(user1.address, exitDate);

            const position = await positionStorage.getPosition(user1.address);
            expect(position.exitDate).to.equal(exitDate);
        });

        it("should return empty position for non-existent user", async function () {
            const position = await positionStorage.getPosition(user2.address);
            expect(position.inBalance).to.equal(0);
            expect(position.shares).to.equal(0);
            expect(position.index.value).to.equal(0);
            expect(position.lastUpdateTime).to.equal(0);
            expect(position.spentIn).to.equal(0);
            expect(position.purchased).to.equal(0);
            expect(position.exitDate).to.equal(0);
        });
    });

    describe("Multiple Users", function () {
        it("should handle multiple users independently", async function () {
            // Create positions for multiple users
            await positionStorage.connect(streamContract).createPosition(
                user1.address,
                1000,
                100,
                { value: 1000000 }
            );

            await positionStorage.connect(streamContract).createPosition(
                user2.address,
                2000,
                200,
                { value: 2000000 }
            );

            // Verify positions are independent
            const position1 = await positionStorage.getPosition(user1.address);
            const position2 = await positionStorage.getPosition(user2.address);

            expect(position1.inBalance).to.equal(1000);
            expect(position1.shares).to.equal(100);
            expect(position2.inBalance).to.equal(2000);
            expect(position2.shares).to.equal(200);
        });

        it("should allow updating different users independently", async function () {
            // Create initial positions
            await positionStorage.connect(streamContract).createPosition(
                user1.address,
                1000,
                100,
                { value: 1000000 }
            );

            await positionStorage.connect(streamContract).createPosition(
                user2.address,
                2000,
                200,
                { value: 2000000 }
            );

            // Update only user1
            const updatedPosition = {
                inBalance: 1500,
                shares: 150,
                index: { value: 1500000 },
                lastUpdateTime: Math.floor(Date.now() / 1000),
                pendingReward: { value: 100 },
                spentIn: 100,
                purchased: 50,
                exitDate: 0
            };

            await positionStorage.connect(streamContract).updatePosition(user1.address, updatedPosition);

            // Verify user1 is updated but user2 remains unchanged
            const position1 = await positionStorage.getPosition(user1.address);
            const position2 = await positionStorage.getPosition(user2.address);

            expect(position1.inBalance).to.equal(1500);
            expect(position1.shares).to.equal(150);
            expect(position2.inBalance).to.equal(2000);
            expect(position2.shares).to.equal(200);
        });
    });

    describe("Edge Cases", function () {
        it("should handle zero values in position creation", async function () {
            await positionStorage.connect(streamContract).createPosition(
                user1.address,
                0,
                0,
                { value: 0 }
            );

            const position = await positionStorage.getPosition(user1.address);
            expect(position.inBalance).to.equal(0);
            expect(position.shares).to.equal(0);
            expect(position.index.value).to.equal(0);
        });

        it("should handle large values in position creation", async function () {
            const largeValue = ethers.MaxUint256;
            await positionStorage.connect(streamContract).createPosition(
                user1.address,
                largeValue,
                largeValue,
                { value: largeValue }
            );

            const position = await positionStorage.getPosition(user1.address);
            expect(position.inBalance).to.equal(largeValue);
            expect(position.shares).to.equal(largeValue);
            expect(position.index.value).to.equal(largeValue);
        });

        it("should handle updating position with zero values", async function () {
            // Create initial position
            await positionStorage.connect(streamContract).createPosition(
                user1.address,
                1000,
                100,
                { value: 1000000 }
            );

            // Update with zero values
            const zeroPosition = {
                inBalance: 0,
                shares: 0,
                index: { value: 0 },
                lastUpdateTime: 0,
                pendingReward: { value: 0 },
                spentIn: 0,
                purchased: 0,
                exitDate: 0
            };

            await positionStorage.connect(streamContract).updatePosition(user1.address, zeroPosition);

            const position = await positionStorage.getPosition(user1.address);
            expect(position.inBalance).to.equal(0);
            expect(position.shares).to.equal(0);
            expect(position.index.value).to.equal(0);
        });

        it("should handle setting exit date to zero", async function () {
            // Create position first
            await positionStorage.connect(streamContract).createPosition(
                user1.address,
                1000,
                100,
                { value: 1000000 }
            );

            // Set exit date to zero
            await positionStorage.connect(streamContract).setExitDate(user1.address, 0);

            const position = await positionStorage.getPosition(user1.address);
            expect(position.exitDate).to.equal(0);
        });

        it("should handle setting exit date to future timestamp", async function () {
            // Create position first
            await positionStorage.connect(streamContract).createPosition(
                user1.address,
                1000,
                100,
                { value: 1000000 }
            );

            const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
            await positionStorage.connect(streamContract).setExitDate(user1.address, futureTimestamp);

            const position = await positionStorage.getPosition(user1.address);
            expect(position.exitDate).to.equal(futureTimestamp);
        });
    });

    describe("Security", function () {
        it("should not allow position creation by unauthorized caller", async function () {
            await expect(
                positionStorage.connect(owner).createPosition(
                    user1.address,
                    1000,
                    100,
                    { value: 1000000 }
                )
            ).to.be.revertedWithCustomError(positionStorage, "UnauthorizedAccess");
        });

        it("should not allow position update by unauthorized caller", async function () {
            const position = {
                inBalance: 1000,
                shares: 100,
                index: { value: 1000000 },
                lastUpdateTime: Math.floor(Date.now() / 1000),
                pendingReward: { value: 0 },
                spentIn: 0,
                purchased: 0,
                exitDate: 0
            };

            await expect(
                positionStorage.connect(owner).updatePosition(user1.address, position)
            ).to.be.revertedWithCustomError(positionStorage, "UnauthorizedAccess");
        });

        it("should not allow exit date setting by unauthorized caller", async function () {
            await expect(
                positionStorage.connect(owner).setExitDate(user1.address, Math.floor(Date.now() / 1000))
            ).to.be.revertedWithCustomError(positionStorage, "UnauthorizedAccess");
        });
    });
}); 