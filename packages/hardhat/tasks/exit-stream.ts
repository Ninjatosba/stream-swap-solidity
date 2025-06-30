import { task } from "hardhat/config";
import { ethers } from "hardhat";
import { Stream } from "../typechain-types";

task("exit-stream", "Exits a stream")
  .addParam("stream", "The address of the stream to exit")
  .addParam("subscriber", "The subscriber account to use (subscriber1 or subscriber2)")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    try {
      // Get accounts
      const { subscriber1, subscriber2 } = await hre.getNamedAccounts();
      const subscriberAddress = taskArgs.subscriber === "subscriber1" ? subscriber1 : subscriber2;
      console.log(`Subscriber address: ${subscriberAddress}`);

      // Get stream contract
      const stream = (await ethers.getContractAt("Stream", taskArgs.stream)) as unknown as Stream;
      console.log(`Stream address: ${taskArgs.stream}`);

      // Get stream status before exit
      const statusBefore = await stream.getStreamStatus();
      console.log(`Stream status before exit: ${statusBefore}`);

      // Get position before exit
      const positionBefore = await stream.getPosition(subscriberAddress);
      console.log("\nPosition before exit:");
      console.log(`In Balance: ${positionBefore.inBalance}`);
      console.log(`Shares: ${positionBefore.shares}`);
      console.log(`Spent In: ${positionBefore.spentIn}`);
      console.log(`Purchased: ${positionBefore.purchased}`);

      // Exit the stream
      console.log("\nExiting stream...");
      const tx = await stream.connect(await ethers.getSigner(subscriberAddress)).exitStream();
      console.log(`Exit transaction hash: ${tx.hash}`);

      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction receipt is null");
      }
      console.log(`Exit transaction confirmed in block: ${receipt.blockNumber}`);

      // Get stream status after exit
      const statusAfter = await stream.getStreamStatus();
      console.log(`\nStream status after exit: ${statusAfter}`);

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
      const exitStreamedEvent = events.find((log: any) => log.name === "ExitStreamed");
      const exitRefundedEvent = events.find((log: any) => log.name === "ExitRefunded");

      if (exitStreamedEvent) {
        console.log("\nSuccessfully exited stream with streaming:");
        console.log(`Purchased: ${exitStreamedEvent.args.purchased}`);
        console.log(`Spent In: ${exitStreamedEvent.args.spentIn}`);
        console.log(`Exit Timestamp: ${exitStreamedEvent.args.exitTimestamp}`);
      } else if (exitRefundedEvent) {
        console.log("\nExited stream with refund:");
        console.log(`Refunded Amount: ${exitRefundedEvent.args.refundedAmount}`);
        console.log(`Exit Timestamp: ${exitRefundedEvent.args.exitTimestamp}`);
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
