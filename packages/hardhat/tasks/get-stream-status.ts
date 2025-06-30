import { task } from "hardhat/config";
import { Stream } from "../typechain-types";

task("get-stream-status", "Gets the current status of a stream")
    .addParam("stream", "The address of the stream")
    .setAction(async (taskArgs, hre) => {
        const { ethers } = hre;

        try {
            // Get stream contract
            const stream = (await ethers.getContractAt("Stream", taskArgs.stream)) as unknown as Stream;
            console.log(`Querying status for stream: ${taskArgs.stream}`);

            // Get stream status
            const status = await stream.getStreamStatus();
            const statusNames = ["Waiting", "Bootstrapping", "Active", "Ended", "FinalizedRefunded", "FinalizedStreamed", "Cancelled"];

            console.log(`\nStream Status: ${status} (${statusNames[Number(status)]})`);

            const streamTimes = await stream.streamTimes();
            console.log("\nStream Timing:");
            console.log(`  Bootstrapping Starts: ${new Date(Number(streamTimes.bootstrappingStartTime) * 1000)}`);
            console.log(`  Streaming Starts:     ${new Date(Number(streamTimes.streamStartTime) * 1000)}`);
            console.log(`  Streaming Ends:       ${new Date(Number(streamTimes.streamEndTime) * 1000)}`);

        } catch (error: any) {
            console.error("Error details:", {
                message: error.message,
                code: error.code,
                data: error.data,
            });
            throw error;
        }
    }); 