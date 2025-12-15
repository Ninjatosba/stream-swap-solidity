/**
 * @title Update Accepted Tokens Task
 * @notice Hardhat task to update accepted tokens in StreamFactory
 * @dev This task allows the protocol admin to add or remove accepted tokens
 * 
 * Usage:
 *   npx hardhat update-accepted-tokens --add "0x123...,0x456..." --remove "0x789..." --network <network>
 * 
 * Parameters:
 *   --add: Comma-separated list of token addresses to add (optional)
 *   --remove: Comma-separated list of token addresses to remove (optional)
 * 
 * What it does:
 *   1. Gets StreamFactory contract from deployments
 *   2. Retrieves protocol admin address from factory params
 *   3. Gets current accepted tokens list
 *   4. Validates token addresses
 *   5. Calls updateAcceptedTokens with add/remove arrays
 *   6. Verifies the update was successful
 * 
 * Requirements:
 *   - Must be called by the protocol admin
 *   - At least one of --add or --remove must be provided
 *   - Token addresses must be valid Ethereum addresses
 * 
 * Example:
 *   npx hardhat update-accepted-tokens --add "0x123...,0x456..." --network localhost
 *   npx hardhat update-accepted-tokens --remove "0x789..." --network sepolia
 *   npx hardhat update-accepted-tokens --add "0x123..." --remove "0x789..." --network monadTestnet
 */

import { task } from "hardhat/config";
import { ethers } from "hardhat";
import { StreamFactory } from "../typechain-types";

task("update-accepted-tokens", "Update accepted tokens in StreamFactory")
    .addOptionalParam("add", "Comma-separated list of token addresses to add")
    .addOptionalParam("remove", "Comma-separated list of token addresses to remove")
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;

        try {
            // Get StreamFactory deployment
            const streamFactoryDeployment = await deployments.get("StreamFactory");
            const streamFactoryAddress = streamFactoryDeployment.address;
            console.log(`StreamFactory address: ${streamFactoryAddress}`);

            // Get contract instance
            const StreamFactoryContract = await ethers.getContractFactory("StreamFactory");
            const streamFactory = StreamFactoryContract.attach(streamFactoryAddress) as unknown as StreamFactory;

            // Get protocol admin from factory params
            const factoryParams = await streamFactory.getParams();
            const protocolAdmin = factoryParams.protocolAdmin;
            console.log(`Protocol Admin: ${protocolAdmin}`);

            // Get protocol admin signer
            const adminSigner = await ethers.getSigner(protocolAdmin);
            console.log(`Admin signer address: ${adminSigner.address}`);

            // Verify admin signer matches protocol admin
            if (adminSigner.address.toLowerCase() !== protocolAdmin.toLowerCase()) {
                throw new Error(
                    `Admin signer address (${adminSigner.address}) does not match protocol admin (${protocolAdmin}). ` +
                    `Make sure you're using the correct account for this network.`
                );
            }

            // Get current accepted tokens
            const currentAcceptedTokens = await streamFactory.getAcceptedInSupplyTokens();
            console.log(`\nCurrent accepted tokens (${currentAcceptedTokens.length}):`);
            currentAcceptedTokens.forEach((token, index) => {
                console.log(`  ${index + 1}. ${token}`);
            });

            // Parse add and remove parameters
            const tokensToAdd: string[] = [];
            const tokensToRemove: string[] = [];

            if (taskArgs.add) {
                const addTokens = taskArgs.add.split(",").map((addr: string) => addr.trim());
                for (const token of addTokens) {
                    if (!ethers.isAddress(token)) {
                        throw new Error(`Invalid address in --add: ${token}`);
                    }
                    tokensToAdd.push(token);
                }
            }

            if (taskArgs.remove) {
                const removeTokens = taskArgs.remove.split(",").map((addr: string) => addr.trim());
                for (const token of removeTokens) {
                    if (!ethers.isAddress(token)) {
                        throw new Error(`Invalid address in --remove: ${token}`);
                    }
                    tokensToRemove.push(token);
                }
            }

            // Validate that at least one operation is requested
            if (tokensToAdd.length === 0 && tokensToRemove.length === 0) {
                throw new Error("At least one of --add or --remove must be provided");
            }

            // Display what will be done
            console.log(`\n📝 Update Summary:`);
            if (tokensToAdd.length > 0) {
                console.log(`  Adding ${tokensToAdd.length} token(s):`);
                tokensToAdd.forEach((token, index) => {
                    console.log(`    ${index + 1}. ${token}`);
                });
            }
            if (tokensToRemove.length > 0) {
                console.log(`  Removing ${tokensToRemove.length} token(s):`);
                tokensToRemove.forEach((token, index) => {
                    console.log(`    ${index + 1}. ${token}`);
                });
            }

            // Check if tokens to add are already accepted
            if (tokensToAdd.length > 0) {
                console.log(`\n🔍 Checking tokens to add...`);
                for (const token of tokensToAdd) {
                    const isAccepted = await streamFactory.isAcceptedInSupplyToken(token);
                    if (isAccepted) {
                        console.log(`  ⚠️  Token ${token} is already accepted (will be skipped)`);
                    }
                }
            }

            // Check if tokens to remove are actually accepted
            if (tokensToRemove.length > 0) {
                console.log(`\n🔍 Checking tokens to remove...`);
                for (const token of tokensToRemove) {
                    const isAccepted = await streamFactory.isAcceptedInSupplyToken(token);
                    if (!isAccepted) {
                        console.log(`  ⚠️  Token ${token} is not currently accepted (will be skipped)`);
                    }
                }
            }

            // Execute the update
            console.log(`\n🔧 Updating accepted tokens...`);
            const tx = await streamFactory
                .connect(adminSigner)
                .updateAcceptedTokens(tokensToAdd, tokensToRemove);
            console.log(`Transaction hash: ${tx.hash}`);
            console.log(`Waiting for confirmation...`);

            const receipt = await tx.wait();
            if (!receipt) {
                throw new Error("Transaction receipt is null");
            }

            console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);
            console.log(`Gas used: ${receipt.gasUsed?.toString()}`);

            // Verify the update
            const updatedAcceptedTokens = await streamFactory.getAcceptedInSupplyTokens();
            console.log(`\n✅ Updated accepted tokens (${updatedAcceptedTokens.length}):`);
            updatedAcceptedTokens.forEach((token, index) => {
                console.log(`  ${index + 1}. ${token}`);
            });

            // Verify tokens were added
            if (tokensToAdd.length > 0) {
                console.log(`\n✅ Verification - Added tokens:`);
                for (const token of tokensToAdd) {
                    const isAccepted = await streamFactory.isAcceptedInSupplyToken(token);
                    if (isAccepted) {
                        console.log(`  ✅ ${token} is now accepted`);
                    } else {
                        console.log(`  ⚠️  ${token} was not added (may have been already accepted)`);
                    }
                }
            }

            // Verify tokens were removed
            if (tokensToRemove.length > 0) {
                console.log(`\n✅ Verification - Removed tokens:`);
                for (const token of tokensToRemove) {
                    const isAccepted = await streamFactory.isAcceptedInSupplyToken(token);
                    if (!isAccepted) {
                        console.log(`  ✅ ${token} is no longer accepted`);
                    } else {
                        console.log(`  ⚠️  ${token} is still accepted (may not have been in the list)`);
                    }
                }
            }

            console.log(`\n🎉 Accepted tokens update completed successfully!`);

        } catch (error: any) {
            console.error("\n❌ Error updating accepted tokens:", {
                message: error.message,
                code: error.code,
                data: error.data,
                transaction: error.transaction,
            });
            throw error;
        }
    });

