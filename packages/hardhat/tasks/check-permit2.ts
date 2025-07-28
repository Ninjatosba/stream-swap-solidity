/**
 * @title Check Permit2 Task
 * @notice Hardhat task to check Permit2 contract availability and get basic information
 * @dev This task helps verify if Permit2 is deployed and accessible on the current network
 * 
 * Usage:
 *   npx hardhat check-permit2 --network <network>
 * 
 * What it does:
 *   1. Checks if Permit2 contract is deployed on the network
 *   2. Gets basic contract information
 *   3. Shows network details
 *   4. Provides guidance for testing
 */

import { task } from "hardhat/config";
import { ethers } from "hardhat";

task("check-permit2", "Check Permit2 contract availability")
    .setAction(async (_, hre) => {
        const { ethers } = hre;

        try {
            console.log("🔍 Checking Permit2 contract availability...\n");

            // Get network info
            const network = await ethers.provider.getNetwork();
            const chainId = Number(network.chainId);
            console.log(`Network Chain ID: ${chainId}`);

            // Permit2 contract address (mainnet address)
            const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
            console.log(`Permit2 Address: ${PERMIT2_ADDRESS}`);

            // Check if Permit2 is deployed
            const permit2Code = await ethers.provider.getCode(PERMIT2_ADDRESS);
            console.log(`Contract Code Length: ${permit2Code.length} bytes`);

            if (permit2Code === "0x") {
                console.log("\n❌ Permit2 contract NOT found on this network");
                console.log("\nThis means:");
                console.log("- Permit2 is not deployed on this network");
                console.log("- You cannot test permit2 subscription on this network");
                console.log("- You need to deploy Permit2 first or use a network that has it");

                console.log("\nNetworks that typically have Permit2:");
                console.log("- Ethereum Mainnet");
                console.log("- Polygon");
                console.log("- Arbitrum");
                console.log("- Optimism");
                console.log("- Base");

                console.log("\nTo test on localhost:");
                console.log("1. Deploy Permit2 contract to your local network");
                console.log("2. Or use mainnet forking: MAINNET_FORKING_ENABLED=true npx hardhat node");

                return;
            }

            console.log("\n✅ Permit2 contract found on network!");

            // Try to get basic contract info
            try {
                const permit2 = await ethers.getContractAt("IPermit2", PERMIT2_ADDRESS);
                console.log("✅ Successfully connected to Permit2 contract");

                // Note: Domain separator not available in our minimal interface
                console.log("Interface connected successfully");

                console.log("\n🎉 Permit2 is ready for testing!");
                console.log("\nYou can now test permit2 subscription with:");
                console.log("npx hardhat subscribe-permit2 --stream <STREAM_ADDRESS> --amount <AMOUNT> --subscriber <SUBSCRIBER>");

            } catch (error: any) {
                console.log(`⚠️  Connected to contract but interface issues: ${error.message}`);
                console.log("This might be due to interface mismatch, but the contract exists");
            }

            // Show current block info
            const currentBlock = await ethers.provider.getBlockNumber();
            const currentTimestamp = Math.floor(Date.now() / 1000);
            console.log(`\nCurrent Block: ${currentBlock}`);
            console.log(`Current Timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toISOString()})`);

        } catch (error: any) {
            console.error("Error checking Permit2:", {
                message: error.message,
                code: error.code,
                data: error.data,
            });
            throw error;
        }
    }); 