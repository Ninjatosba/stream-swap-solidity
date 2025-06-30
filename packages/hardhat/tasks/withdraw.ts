import { task } from "hardhat/config";
import { parseEther } from "ethers";
import { Stream } from "../typechain-types";

task("withdraw", "Withdraw from a stream")
    .addParam("stream", "The address of the stream to withdraw from")
    .addParam("amount", "Amount of tokens to withdraw")
    .addParam("subscriber", "The subscriber account to use (subscriber1 or subscriber2)")
    .setAction(async (taskArgs, hre) => {
        const { ethers, getNamedAccounts } = hre;

        try {
            // Get accounts
            const { subscriber1, subscriber2 } = await getNamedAccounts();
            const subscriberAddress = taskArgs.subscriber === "subscriber1" ? subscriber1 : subscriber2;
            console.log(`Subscriber address: ${subscriberAddress}`);

            // Get stream contract
            const stream = (await ethers.getContractAt("Stream", taskArgs.stream)) as unknown as Stream;
            console.log(`Stream address: ${taskArgs.stream}`);

            // Check stream status
            const status = await stream.getStreamStatus();
            const statusNames = ["Waiting", "Bootstrapping", "Active", "Ended", "FinalizedRefunded", "FinalizedStreamed", "Cancelled"];
            console.log(`Stream status: ${statusNames[Number(status)]}`);

            if (status !== 1n && status !== 2n) { // Not Bootstrapping or Active
                throw new Error("Withdrawal is only allowed during Bootstrapping or Active phases.");
            }

            const amount = parseEther(taskArgs.amount);
            console.log(`Withdrawing amount: ${amount}`);

            const subscriberSigner = await ethers.getSigner(subscriberAddress);

            // Check position before withdraw
            const positionBefore = await stream.getPosition(subscriberAddress);
            console.log(`\nPosition before withdraw:`);
            console.log(`  In Balance: ${positionBefore.inBalance}`);
            console.log(`  Shares: ${positionBefore.shares}`);

            if (positionBefore.inBalance < amount) {
                throw new Error("Withdrawal amount exceeds your current unspent balance in the stream.");
            }

            // Withdraw
            console.log("\nAttempting to withdraw...");
            const withdrawTx = await stream.connect(subscriberSigner).withdraw(amount);
            console.log(`Withdraw transaction: ${withdrawTx.hash}`);
            const receipt = await withdrawTx.wait();
            console.log(`Withdraw transaction confirmed in block: ${receipt?.blockNumber}`);

            // Get position after withdraw
            const positionAfter = await stream.getPosition(subscriberAddress);
            console.log("\nPosition after withdraw:");
            console.log(`  In Balance: ${positionAfter.inBalance}`);
            console.log(`  Shares: ${positionAfter.shares}`);

        } catch (error: any) {
            console.error("Error details:", {
                message: error.message,
                code: error.code,
                data: error.data,
            });
            throw error;
        }
    }); 