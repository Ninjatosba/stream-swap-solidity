/**
 * @title Subscribe with Permit2 Task
 * @notice Hardhat task to subscribe to an existing stream using Permit2 signature-based allowance
 * @dev This task demonstrates the permit2 subscription process including signature generation and permit validation
 * 
 * Usage:
 *   npx hardhat subscribe-permit2 --stream <stream_address> --amount <amount> --subscriber <subscriber> --network <network>
 * 
 * Parameters:
 *   --stream: Address of the stream to subscribe to
 *   --amount: Amount of input tokens to subscribe with
 *   --subscriber: Subscriber account to use (subscriber1 or subscriber2)
 * 
 * Prerequisites:
 *   1. Stream must exist and be in Bootstrapping or Active phase
 *   2. Subscriber must have sufficient input token balance
 *   3. Subscriber must have ETH for gas fees
 *   4. InToken must be deployed and subscriber must have tokens
 *   5. Permit2 contract must be deployed on the network
 * 
 * What it does:
 *   1. Validates stream address and gets stream contract instance
 *   2. Gets subscriber account based on parameter
 *   3. Checks stream status to ensure subscription is allowed
 *   4. Gets input token address from stream
 *   5. Checks subscriber's input token balance
 *   6. Approves Permit2 to spend maximum amount (one-time setup)
 *   7. Generates Permit2 signature for stream allowance (time-limited)
 *   8. Executes subscription with permit2 transaction
 *   9. Shows updated balances and position info
 * 
 * Example:
 *   npx hardhat subscribe-permit2 --stream 0x123... --amount 1000000000000000000 --subscriber subscriber1 --network localhost
 * 
 * Output:
 *   - Shows subscriber account and stream details
 *   - Displays token balances before and after subscription
 *   - Shows transaction hash and gas used
 *   - Displays updated position information
 *   - Shows permit2 signature details
 */

import { task } from "hardhat/config";
import { parseEther, ethers } from "ethers";
import { ERC20Mock, IStream, StreamCore } from "../typechain-types";

// Permit2 domain separator for EIP-712 signing
const PERMIT2_DOMAIN = {
    name: "Permit2",
    chainId: 1, // Will be overridden
    verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3" // Permit2 address
};

// Permit2 types for EIP-712
const PERMIT_DETAILS_TYPE = [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" }
];

const PERMIT_SINGLE_TYPE = [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" }
];

const PERMIT_DETAILS_ABI = [
    "struct PermitDetails { address token; uint160 amount; uint48 expiration; uint48 nonce; }"
];

const PERMIT_SINGLE_ABI = [
    "struct PermitSingle { PermitDetails details; address spender; uint256 sigDeadline; }"
];

task("subscribe-permit2", "Subscribe to a stream using Permit2")
    .addParam("stream", "The address of the stream to subscribe to")
    .addParam("amount", "Amount of tokens to subscribe with")
    .addParam("subscriber", "The subscriber account to use (subscriber1 or subscriber2)")
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;

        try {
            // Get accounts
            const { subscriber1, subscriber2 } = await hre.getNamedAccounts();
            const subscriberAddress = taskArgs.subscriber === "subscriber1" ? subscriber1 : subscriber2;
            console.log(`Subscriber address: ${subscriberAddress}`);

            // Get subscriber signer
            const subscriberSigner = await ethers.getSigner(subscriberAddress);
            console.log(`Subscriber signer: ${subscriberSigner.address}`);

            // Query subscriber balance
            const nativeBalance = await ethers.provider.getBalance(subscriberAddress);
            console.log(`Subscriber ETH balance: ${ethers.formatEther(nativeBalance)} ETH`);

            // Get stream contract
            const stream = (await ethers.getContractAt("IStream", taskArgs.stream)) as unknown as IStream;
            console.log(`Stream address: ${taskArgs.stream}`);

            // Get stream status
            const status = await stream.getStreamStatus();
            console.log(`Stream status: ${status}`);

            // Get in token address from stream (via StreamCore ABI)
            const core = (await ethers.getContractAt("StreamCore", taskArgs.stream)) as unknown as StreamCore;
            const streamTokens = await core.streamTokens();
            const inTokenAddress = streamTokens.inSupplyToken;
            console.log(`In token address: ${inTokenAddress}`);

            // Get in token contract
            const inToken = (await ethers.getContractAt("ERC20Mock", inTokenAddress)) as unknown as ERC20Mock;

            // Parse amount
            const amount = parseEther(taskArgs.amount);
            console.log(`Subscribing with amount: ${ethers.formatEther(amount)} tokens`);

            // Get network info for permit2
            const network = await ethers.provider.getNetwork();
            const chainId = Number(network.chainId);
            console.log(`Chain ID: ${chainId}`);

            // Permit2 contract address (mainnet address, but works on other networks too)
            const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
            console.log(`Permit2 address: ${PERMIT2_ADDRESS}`);

            // Check balance
            const balance = await inToken.balanceOf(subscriberAddress);
            console.log(`Subscriber token balance: ${ethers.formatEther(balance)} tokens`);
            if (balance < amount) {
                throw new Error("Insufficient token balance");
            }

            // Step 1: Approve Permit2 to spend user's tokens (max approval)
            // This is the first approval in the permit2 flow: User -> Permit2
            // We use max approval (type(uint160).max) for efficiency - only need to do this once per token
            // After this, all future subscriptions can use permits without additional approvals
            console.log("\n--- Step 1: Permit2 Max Approval Check ---");
            const permit2Allowance = await inToken.allowance(subscriberAddress, PERMIT2_ADDRESS);
            const maxApproval = ethers.getBigInt("0xffffffffffffffffffffffffffffffffffffffff"); // type(uint160).max
            console.log(`Current Permit2 allowance: ${ethers.formatEther(permit2Allowance)} tokens`);
            console.log(`Max approval amount: ${ethers.formatEther(maxApproval)} tokens`);

            if (permit2Allowance < maxApproval) {
                console.log(`Approving Permit2 to spend maximum amount (${ethers.formatEther(maxApproval)} tokens)...`);
                console.log("This approval will be valid until revoked or expired");

                const approveTx = await inToken
                    .connect(subscriberSigner)
                    .approve(PERMIT2_ADDRESS, maxApproval);
                console.log(`Permit2 max approval transaction: ${approveTx.hash}`);
                const approveReceipt = await approveTx.wait();
                console.log(`Permit2 max approval confirmed in block: ${approveReceipt?.blockNumber}`);

                // Verify the approval
                const newPermit2Allowance = await inToken.allowance(subscriberAddress, PERMIT2_ADDRESS);
                console.log(`New Permit2 allowance: ${ethers.formatEther(newPermit2Allowance)} tokens`);
                console.log("✅ Permit2 now has maximum allowance - no more approvals needed for this token!");
            } else {
                console.log("✅ Permit2 already has maximum allowance");
                console.log("No additional approval needed - can use permits directly!");
            }

            // Check if Permit2 is deployed on this network
            const permit2Code = await ethers.provider.getCode(PERMIT2_ADDRESS);
            if (permit2Code === "0x") {
                console.log("⚠️  Warning: Permit2 contract not found on this network");
                console.log("This script is designed for networks with Permit2 deployed");
                console.log("For local testing, you may need to deploy Permit2 first");
            } else {
                console.log("✅ Permit2 contract found on network");
            }

            // Get current timestamp and set deadline
            const currentTime = Math.floor(Date.now() / 1000);
            const sigDeadline = currentTime + 3600; // 1 hour from now
            console.log(`Signature deadline: ${sigDeadline} (${new Date(sigDeadline * 1000).toISOString()})`);

            // For testing purposes, we'll use a fixed nonce of 0
            // In production, you would get the actual nonce from Permit2
            const nonce = 0;
            console.log(`Using nonce: ${nonce} (for testing purposes)`);

            // Set expiration (1 hour from now)
            const expiration = currentTime + 3600;

            // Create permit details
            const permitDetails = {
                token: inTokenAddress,
                amount: amount,
                expiration: expiration,
                nonce: nonce
            };

            console.log("\nPermit Details:");
            console.log(`Token: ${permitDetails.token}`);
            console.log(`Amount: ${permitDetails.amount}`);
            console.log(`Expiration: ${permitDetails.expiration} (${new Date(permitDetails.expiration * 1000).toISOString()})`);
            console.log(`Nonce: ${permitDetails.nonce}`);

            // Create permit single
            const permitSingle = {
                details: permitDetails,
                spender: await stream.getAddress(),
                sigDeadline: sigDeadline
            };

            console.log("\nPermit Single:");
            console.log(`Spender: ${permitSingle.spender}`);
            console.log(`Sig Deadline: ${permitSingle.sigDeadline}`);

            // Create domain for EIP-712 signing
            const domain = {
                name: "Permit2",
                chainId: chainId,
                verifyingContract: PERMIT2_ADDRESS
            };

            console.log("\nDomain for signing:");
            console.log(`Name: ${domain.name}`);
            console.log(`Chain ID: ${domain.chainId}`);
            console.log(`Verifying Contract: ${domain.verifyingContract}`);

            // Create types for EIP-712
            const types = {
                PermitDetails: PERMIT_DETAILS_TYPE,
                PermitSingle: PERMIT_SINGLE_TYPE
            };

            // Step 2: Sign permit allowing stream to spend tokens through Permit2
            // This is the second approval in the permit2 flow: User -> Stream (via Permit2)
            console.log("\n--- Step 2: Permit Signature ---");
            console.log("Signing permit...");
            const signature = await subscriberSigner.signTypedData(domain, types, permitSingle);
            console.log(`Signature: ${signature}`);

            // Verify signature
            const recoveredAddress = ethers.verifyTypedData(domain, types, permitSingle, signature);
            console.log(`Recovered address: ${recoveredAddress}`);
            console.log(`Expected address: ${subscriberAddress}`);
            console.log(`Signature valid: ${recoveredAddress.toLowerCase() === subscriberAddress.toLowerCase()}`);

            // Subscribe with permit2 (with empty merkle proof for public streams)
            console.log("\nAttempting to subscribe with Permit2...");
            const subscribeTx = await stream.connect(subscriberSigner).subscribeWithPermit(
                amount,
                subscriberAddress,
                permitSingle,
                signature,
                [] // merkleProof - empty array for public streams
            );
            console.log(`Subscribe transaction: ${subscribeTx.hash}`);

            const receipt = await subscribeTx.wait();
            console.log(`Subscribe transaction confirmed in block: ${receipt?.blockNumber}`);
            console.log(`Gas used: ${receipt?.gasUsed?.toString()}`);

            // Get position
            const position = await stream.getPosition(subscriberAddress);
            console.log("\nPosition details:");
            console.log(`In balance: ${ethers.formatEther(position.inBalance)} tokens`);
            console.log(`Shares: ${position.shares}`);
            console.log(`Spent in: ${ethers.formatEther(position.spentIn)} tokens`);
            console.log(`Purchased: ${ethers.formatEther(position.purchased)} tokens`);

            // Get updated token balance
            const updatedBalance = await inToken.balanceOf(subscriberAddress);
            console.log(`\nUpdated token balance: ${ethers.formatEther(updatedBalance)} tokens`);
            console.log(`Tokens spent: ${ethers.formatEther(balance - updatedBalance)} tokens`);

            console.log("\n✅ Permit2 subscription successful!");

        } catch (error: any) {
            console.error("\n❌ Error details:", {
                message: error.message,
                code: error.code,
                data: error.data,
                transaction: error.transaction,
            });
            throw error;
        }
    }); 