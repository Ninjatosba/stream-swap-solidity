import { task } from "hardhat/config";
import { ethers } from "hardhat";
import { Stream } from "../typechain-types";

task("finalize-stream", "Finalizes a stream")
  .addParam("stream", "The address of the stream to finalize")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    try {
      // Get accounts
      const { creator } = await hre.getNamedAccounts();
      console.log(`Creator address: ${creator}`);

      // Get stream contract
      const stream = (await ethers.getContractAt("Stream", taskArgs.stream)) as unknown as Stream;
      console.log(`Stream address: ${taskArgs.stream}`);

      // Get stream status before finalization
      const statusBefore = await stream.getStreamStatus();
      console.log(`\nStream status before finalization: ${statusBefore}`);

      // Get stream state before finalization
      const stateBefore = await stream.getStreamState();
      console.log("\nStream state before finalization:");
      console.log(`Out Remaining: ${stateBefore.outRemaining}`);
      console.log(`Spent In: ${stateBefore.spentIn}`);
      console.log(`Shares: ${stateBefore.shares}`);
      console.log(`In Supply: ${stateBefore.inSupply}`);
      console.log(`Out Supply: ${stateBefore.outSupply}`);

      // Finalize the stream
      console.log("\nFinalizing stream...");
      const tx = await stream.connect(await ethers.getSigner(creator)).finalizeStream();
      console.log(`Finalization transaction hash: ${tx.hash}`);

      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction receipt is null");
      }
      console.log(`Finalization transaction confirmed in block: ${receipt.blockNumber}`);

      // Get stream status after finalization
      const statusAfter = await stream.getStreamStatus();
      console.log(`\nStream status after finalization: ${statusAfter}`);

      // Parse events
      const events = receipt.logs
        .map((log: any) => {
          try {
            return stream.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((log: any) => log !== null);

      // Find relevant events
      const finalizedStreamedEvent = events.find((log: any) => log.name === "FinalizedStreamed");
      const finalizedRefundedEvent = events.find((log: any) => log.name === "FinalizedRefunded");

      if (finalizedStreamedEvent) {
        console.log("\nStream was successfully finalized with streaming:");
        console.log(`Creator Revenue: ${finalizedStreamedEvent.args.creatorRevenue}`);
        console.log(`Exit Fee Amount: ${finalizedStreamedEvent.args.exitFeeAmount}`);
        console.log(`Refunded Out Amount: ${finalizedStreamedEvent.args.refundedOutAmount}`);
      } else if (finalizedRefundedEvent) {
        console.log("\nStream was finalized with refund:");
        console.log(`Refunded Out Amount: ${finalizedRefundedEvent.args.refundedOutAmount}`);
      }
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
