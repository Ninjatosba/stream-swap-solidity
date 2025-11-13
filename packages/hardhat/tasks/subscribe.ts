/**
 * @title Subscribe Task
 * @notice Hardhat task to subscribe to an existing stream with input tokens
 * @dev This task demonstrates the subscription process including token approvals and balance checks
 * 
 * Usage:
 *   npx hardhat subscribe --stream <stream_address> --amount <amount> --subscriber <subscriber> --network <network>
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
 * 
 * What it does:
 *   1. Validates stream address and gets stream contract instance
 *   2. Gets subscriber account based on parameter
 *   3. Checks stream status to ensure subscription is allowed
 *   4. Gets input token address from stream
 *   5. Checks subscriber's input token balance
 *   6. Approves stream to spend input tokens if needed
 *   7. Executes subscription transaction
 *   8. Shows updated balances and position info
 * 
 * Example:
 *   npx hardhat subscribe --stream 0x123... --amount 1000000000000000000 --subscriber subscriber1 --network localhost
 * 
 * Output:
 *   - Shows subscriber account and stream details
 *   - Displays token balances before and after subscription
 *   - Shows transaction hash and gas used
 *   - Displays updated position information
 */

import { task } from "hardhat/config";
import { parseEther } from "ethers";
import { ERC20Mock, IStream, StreamCore } from "../typechain-types";

task("subscribe", "Subscribe to a stream")
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

      // query subscriber balance
      const nativeBalance = await ethers.provider.getBalance(subscriberAddress);
      console.log(`Subscriber balance: ${nativeBalance}`);

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
      console.log(`Subscribing with amount: ${amount}`);

      // Check balance
      const balance = await inToken.balanceOf(subscriberAddress);
      console.log(`Subscriber balance: ${balance}`);
      if (balance < amount) {
        throw new Error("Insufficient balance");
      }

      // Approve tokens if needed
      const allowance = await inToken.allowance(subscriberAddress, taskArgs.stream);
      console.log(`Allowance: ${allowance}`);
      if (allowance < amount) {
        const approveTx = await inToken
          .connect(await ethers.getSigner(subscriberAddress))
          .approve(taskArgs.stream, amount);
        await approveTx.wait();
        console.log("Approved tokens for stream");
      }

      // Subscribe
      console.log("Attempting to subscribe...");
      const subscribeTx = await stream.connect(await ethers.getSigner(subscriberAddress)).subscribe(amount);
      console.log(`Subscribe transaction: ${subscribeTx.hash}`);
      const receipt = await subscribeTx.wait();
      console.log(`Subscribe transaction confirmed in block: ${receipt?.blockNumber}`);

      // Get position
      const position = await stream.getPosition(subscriberAddress);
      console.log("\nPosition details:");
      console.log(`In balance: ${position.inBalance}`);
      console.log(`Shares: ${position.shares}`);
    } catch (error: any) {
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        data: error.data,
        transaction: error.transaction,
      });
      throw error;
    }
  });
