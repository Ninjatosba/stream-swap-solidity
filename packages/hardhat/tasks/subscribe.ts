import { task } from "hardhat/config";
import { parseEther } from "ethers";
import { ERC20Mock, Stream } from "../typechain-types";

task("subscribe", "Subscribe to a stream")
    .addParam("stream", "The address of the stream to subscribe to")
    .addParam("amount", "Amount of tokens to subscribe with")
    .addParam("subscriber", "The subscriber account to use (subscriber1 or subscriber2)")
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;

        // Get accounts
        const { subscriber1, subscriber2 } = await hre.getNamedAccounts();
        const subscriberAddress = taskArgs.subscriber === "subscriber1" ? subscriber1 : subscriber2;
        console.log(`Subscriber address: ${subscriberAddress}`);

        // Get stream contract
        const stream = await ethers.getContractAt("Stream", taskArgs.stream) as unknown as Stream;
        console.log(`Stream address: ${taskArgs.stream}`);

        // Get in token address from stream
        const streamTokens = await stream.streamTokens();
        const inTokenAddress = streamTokens.inSupplyToken;
        console.log(`In token address: ${inTokenAddress}`);

        // Get in token contract
        const inToken = await ethers.getContractAt("ERC20Mock", inTokenAddress) as unknown as ERC20Mock;

        // Parse amount
        const amount = parseEther(taskArgs.amount);
        console.log(`Subscribing with amount: ${amount}`);

        // Check balance
        const balance = await inToken.balanceOf(subscriberAddress);
        console.log(`Subscriber balance: ${balance}`);
        if (balance < amount) {
            throw new Error("Insufficient balance");
        }

        // Approve tokens
        const approveTx = await inToken.connect(await ethers.getSigner(subscriberAddress)).approve(taskArgs.stream, amount);
        await approveTx.wait();
        console.log("Approved tokens for stream");

        // Subscribe
        const subscribeTx = await stream.connect(await ethers.getSigner(subscriberAddress)).subscribe(amount);
        console.log(`Subscribe transaction: ${subscribeTx.hash}`);
        const receipt = await subscribeTx.wait();
        console.log(`Subscribe transaction confirmed in block: ${receipt?.blockNumber}`);

        // Get position
        const position = await stream.getPosition(subscriberAddress);
        console.log("\nPosition details:");
        console.log(`In balance: ${position.inBalance}`);
        console.log(`Shares: ${position.shares}`);
    }); 