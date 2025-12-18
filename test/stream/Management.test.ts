import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { stream } from "../helpers/StreamFixtureBuilder";
import { Errors } from "../types";
import { advanceStreamToPhase } from "../helpers/stream";

describe("Stream Management", function () {
  describe("updateStreamMetadata", function () {
    it("should allow creator to update stream metadata", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      const newMetadataHash = "QmNewMetadataHash123";

      // Update metadata
      await expect(
        contracts.stream.connect(accounts.creator).updateStreamMetadata(newMetadataHash)
      ).to.emit(contracts.stream, "StreamMetadataUpdated")
        .withArgs(await contracts.stream.getAddress(), newMetadataHash);

      // Verify the metadata was updated
      const streamMetadata = await contracts.stream.getStreamMetadata();
      expect(streamMetadata.ipfsHash).to.equal(newMetadataHash);
    });

    it("should not allow non-creator to update stream metadata", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      const newMetadataHash = "QmNewMetadataHash123";

      // Try to update metadata with non-creator account
      await expect(
        contracts.stream.connect(accounts.subscriber1).updateStreamMetadata(newMetadataHash)
      ).to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
    });

    it("should not allow protocol admin to update stream metadata", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      const newMetadataHash = "QmNewMetadataHash123";

      // Try to update metadata with protocol admin account
      await expect(
        contracts.stream.connect(accounts.protocolAdmin).updateStreamMetadata(newMetadataHash)
      ).to.be.revertedWithCustomError(contracts.stream, "Unauthorized");
    });

    it("should allow creator to update metadata multiple times", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      const firstMetadataHash = "QmFirstMetadataHash";
      const secondMetadataHash = "QmSecondMetadataHash";
      const thirdMetadataHash = "QmThirdMetadataHash";

      // First update
      await expect(
        contracts.stream.connect(accounts.creator).updateStreamMetadata(firstMetadataHash)
      ).to.emit(contracts.stream, "StreamMetadataUpdated")
        .withArgs(await contracts.stream.getAddress(), firstMetadataHash);

      // Second update
      await expect(
        contracts.stream.connect(accounts.creator).updateStreamMetadata(secondMetadataHash)
      ).to.emit(contracts.stream, "StreamMetadataUpdated")
        .withArgs(await contracts.stream.getAddress(), secondMetadataHash);

      // Third update
      await expect(
        contracts.stream.connect(accounts.creator).updateStreamMetadata(thirdMetadataHash)
      ).to.emit(contracts.stream, "StreamMetadataUpdated")
        .withArgs(await contracts.stream.getAddress(), thirdMetadataHash);

      // Verify the final metadata
      const streamMetadata = await contracts.stream.getStreamMetadata();
      expect(streamMetadata.ipfsHash).to.equal(thirdMetadataHash);
    });

    it("should allow creator to update metadata with empty string", async function () {
      const { contracts, accounts } = await loadFixture(stream().build());

      const emptyMetadataHash = "";

      // Update metadata with empty string
      await expect(
        contracts.stream.connect(accounts.creator).updateStreamMetadata(emptyMetadataHash)
      ).to.emit(contracts.stream, "StreamMetadataUpdated")
        .withArgs(await contracts.stream.getAddress(), emptyMetadataHash);

      // Verify the metadata was updated
      const streamMetadata = await contracts.stream.getStreamMetadata();
      expect(streamMetadata.ipfsHash).to.equal(emptyMetadataHash);
    });

    it("should allow creator to update metadata during different stream phases", async function () {
      const { contracts, timeParams, accounts } = await loadFixture(stream().build());

      const metadataHash1 = "QmPhase1Metadata";
      const metadataHash2 = "QmPhase2Metadata";
      const metadataHash3 = "QmPhase3Metadata";

      // Update during WAITING phase
      await expect(
        contracts.stream.connect(accounts.creator).updateStreamMetadata(metadataHash1)
      ).to.emit(contracts.stream, "StreamMetadataUpdated");

      // Move to bootstrapping phase and sync
      await advanceStreamToPhase(contracts.stream, "bootstrapping", timeParams);

      // Update during BOOTSTRAPPING phase
      await expect(
        contracts.stream.connect(accounts.creator).updateStreamMetadata(metadataHash2)
      ).to.emit(contracts.stream, "StreamMetadataUpdated");

      // Move to active phase and sync
      await advanceStreamToPhase(contracts.stream, "active", timeParams);

      // Update during ACTIVE phase
      await expect(
        contracts.stream.connect(accounts.creator).updateStreamMetadata(metadataHash3)
      ).to.emit(contracts.stream, "StreamMetadataUpdated");

      // Verify the final metadata
      const streamMetadata = await contracts.stream.getStreamMetadata();
      expect(streamMetadata.ipfsHash).to.equal(metadataHash3);
    });
  });
});
