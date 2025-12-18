/**
 * Merkle tree helper for whitelist testing
 *
 * Builds merkle trees compatible with OpenZeppelin's MerkleProof library
 * Leaf format: keccak256(abi.encodePacked(address))
 */

import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";

/**
 * Build a merkle tree from a list of addresses
 * @param addresses Array of addresses to include in the whitelist
 * @returns Object with root and getProof function
 */
export function buildMerkleWhitelist(addresses: string[]): {
  root: string;
  getProof: (address: string) => string[];
} {
  if (addresses.length === 0) {
    throw new Error("Cannot build merkle tree with empty address list");
  }

  // Generate leaves: keccak256(abi.encodePacked(address))
  // Note: ethers.solidityPacked is equivalent to abi.encodePacked in Solidity
  const leaves = addresses.map((address) => {
    // Ensure address is checksummed
    const checksummedAddress = ethers.getAddress(address);
    // keccak256(abi.encodePacked(address))
    return ethers.keccak256(ethers.solidityPacked(["address"], [checksummedAddress]));
  });

  // Build merkle tree (merkletreejs uses keccak256 by default)
  const tree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });

  // Get root
  const root = tree.getHexRoot();

  // Return root and proof getter function
  return {
    root,
    getProof: (address: string) => {
      const checksummedAddress = ethers.getAddress(address);
      const leaf = ethers.keccak256(ethers.solidityPacked(["address"], [checksummedAddress]));
      const proof = tree.getHexProof(leaf);
      return proof;
    },
  };
}

