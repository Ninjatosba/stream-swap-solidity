/**
 * @title Setup Permit2 Task
 * @notice Hardhat task to set up initial Permit2 approval for a user
 * @dev This task sets up the maximum approval for Permit2, which is a one-time setup per token
 * 
 * Usage:
 *   npx hardhat setup-permit2 --token <token_address> --subscriber <subscriber> --network <network>
 * 
 * Parameters:
 *   --token: Address of the token to approve for Permit2
 *   --subscriber: Subscriber account to use (subscriber1 or subscriber2)
 * 
 * What it does:
 *   1. Gets subscriber account and token contract
 *   2. Checks current Permit2 allowance
 *   3. Approves maximum amount for Permit2 (one-time setup)
 *   4. Verifies the approval was successful
 * 
 * Benefits:
 *   - One-time setup per token
 *   - No need for future approve transactions
 *   - Can use permits for all future transactions
 *   - More gas efficient
 * 
 * Example:
 *   npx hardhat setup-permit2 --token 0x123... --subscriber subscriber1 --network localhost
 */

import { task } from "hardhat/config";
import { ethers } from "hardhat";
import { ERC20Mock } from "../typechain-types";

task("setup-permit2", "Set up initial Permit2 approval for a user")
    .addParam("token", "The address of the token to approve for Permit2")
    .addParam("subscriber", "The subscriber account to use (subscriber1 or subscriber2)")
    .setAction(async (taskArgs, hre) => {
        const { ethers } = hre;

        try {
            // Get accounts
            const { subscriber1, subscriber2 } = await hre.getNamedAccounts();
            const subscriberAddress = taskArgs.subscriber === "subscriber1" ? subscriber1 : subscriber2;
            console.log(`Subscriber address: ${subscriberAddress}`);

            // Get subscriber signer
            const subscriberSigner = await ethers.getSigner(subscriberAddress);
            console.log(`Subscriber signer: ${subscriberSigner.address}`);

            // Get token contract
            const token = (await ethers.getContractAt("ERC20Mock", taskArgs.token)) as unknown as ERC20Mock;
            console.log(`Token address: ${taskArgs.token}`);

            // Get token info
            const tokenName = await token.name();
            const tokenSymbol = await token.symbol();
            const tokenDecimals = await token.decimals();
            console.log(`Token: ${tokenName} (${tokenSymbol}) - ${tokenDecimals} decimals`);

            // Check token balance
            const balance = await token.balanceOf(subscriberAddress);
            console.log(`\nSubscriber token balance: ${ethers.formatUnits(balance, tokenDecimals)} ${tokenSymbol}`);

            // Permit2 contract address
            const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
            console.log(`Permit2 address: ${PERMIT2_ADDRESS}`);

            // Check current Permit2 allowance
            const currentAllowance = await token.allowance(subscriberAddress, PERMIT2_ADDRESS);
            console.log(`\nCurrent Permit2 allowance: ${ethers.formatUnits(currentAllowance, tokenDecimals)} ${tokenSymbol}`);

            // Maximum approval amount (type(uint160).max)
            const maxApproval = ethers.getBigInt("0xffffffffffffffffffffffffffffffffffffffff");
            console.log(`Maximum approval amount: ${ethers.formatUnits(maxApproval, tokenDecimals)} ${tokenSymbol}`);

            if (currentAllowance >= maxApproval) {
                console.log("\n✅ Permit2 already has maximum allowance for this token!");
                console.log("No setup needed - you can use permits directly for subscriptions.");
                return;
            }

            console.log("\n🔧 Setting up Permit2 approval...");
            console.log("This is a one-time setup per token. After this, you won't need to approve again!");

            // Approve maximum amount for Permit2
            const approveTx = await token
                .connect(subscriberSigner)
                .approve(PERMIT2_ADDRESS, maxApproval);
            console.log(`\nApproval transaction: ${approveTx.hash}`);

            const receipt = await approveTx.wait();
            console.log(`Approval confirmed in block: ${receipt?.blockNumber}`);
            console.log(`Gas used: ${receipt?.gasUsed?.toString()}`);

            // Verify the approval
            const newAllowance = await token.allowance(subscriberAddress, PERMIT2_ADDRESS);
            console.log(`\nNew Permit2 allowance: ${ethers.formatUnits(newAllowance, tokenDecimals)} ${tokenSymbol}`);

            if (newAllowance >= maxApproval) {
                console.log("\n🎉 Permit2 setup successful!");
                console.log("\nBenefits of this setup:");
                console.log("✅ No more approve transactions needed for this token");
                console.log("✅ Can use permits for all future subscriptions");
                console.log("✅ More gas efficient");
                console.log("✅ Better user experience");

                console.log("\nNext steps:");
                console.log("You can now use permit2 subscription with:");
                console.log(`npx hardhat subscribe-permit2 --stream <STREAM_ADDRESS> --amount <AMOUNT> --subscriber ${taskArgs.subscriber} --network <NETWORK>`);
            } else {
                console.log("\n❌ Setup failed - allowance not set correctly");
                throw new Error("Permit2 approval failed");
            }

        } catch (error: any) {
            console.error("\n❌ Error setting up Permit2:", {
                message: error.message,
                code: error.code,
                data: error.data,
                transaction: error.transaction,
            });
            throw error;
        }
    }); 