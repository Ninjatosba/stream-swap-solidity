import hre from "hardhat";
import { defaultStreamConfig } from "../packages/hardhat/deploy/config/stream-config";

async function main() {
    // Get deployment addresses using Hardhat Deploy
    const streamFactoryDeployment = await hre.deployments.get("StreamFactory");
    const inTokenDeployment = await hre.deployments.get("InToken");
    const outTokenDeployment = await hre.deployments.get("OutToken");

    const streamFactoryAddress = streamFactoryDeployment.address;
    const inTokenAddress = inTokenDeployment.address;
    const outTokenAddress = outTokenDeployment.address;

    // Get accounts
    const [deployer, creator] = await hre.ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Creator: ${creator.address}`);

    // Get contract instances
    const streamFactory = await hre.ethers.getContractAt("StreamFactory", streamFactoryAddress);
    const outToken = await hre.ethers.getContractAt("ERC20Mock", outTokenAddress);

    // Check creator's output token balance
    const creatorOutTokenBalance = await outToken.balanceOf(creator.address);
    console.log(`Creator's output token balance: ${creatorOutTokenBalance}`);
    if (creatorOutTokenBalance < defaultStreamConfig.streamOutAmount) {
        throw new Error("Insufficient output token balance");
    }

    // Approve tokens if needed
    const allowance = await outToken.allowance(creator.address, streamFactoryAddress);
    if (allowance < defaultStreamConfig.streamOutAmount) {
        const approveTx = await outToken.connect(creator).approve(streamFactoryAddress, defaultStreamConfig.streamOutAmount);
        await approveTx.wait();
        console.log("Approved out token for StreamFactory");
    }

    // Get factory params
    const factoryParams = await streamFactory.getParams();
    const streamCreationFee = factoryParams.streamCreationFee;
    const streamCreationFeeToken = factoryParams.streamCreationFeeToken;
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    let txOptions = {};
    if (streamCreationFeeToken === zeroAddress) {
        txOptions = streamCreationFee ? { value: streamCreationFee } : {};
    }

    // Get current block timestamp
    const latestBlock = await hre.ethers.provider.getBlock("latest");
    const nowSeconds = latestBlock?.timestamp ?? 0;
    const bootstrappingStartTime = nowSeconds + 500;
    const streamStartTime = nowSeconds + 6500;
    const streamEndTime = nowSeconds + 106500;

    // Prepare stream creation message
    const salt = hre.ethers.hexlify(hre.ethers.randomBytes(32));
    const createStreamMessage = {
        streamOutAmount: defaultStreamConfig.streamOutAmount,
        outSupplyToken: outTokenAddress,
        bootstrappingStartTime,
        streamStartTime,
        streamEndTime,
        threshold: defaultStreamConfig.threshold,
        name: defaultStreamConfig.streamName,
        inSupplyToken: inTokenAddress,
        tosVersion: defaultStreamConfig.tosVersion,
        creator: creator.address,
        creatorVesting: defaultStreamConfig.creatorVestingInfo,
        beneficiaryVesting: defaultStreamConfig.beneficiaryVestingInfo,
        poolInfo: { poolOutSupplyAmount: 0 },
        salt,
    };

    // Create stream
    const tx = await streamFactory.connect(creator).createStream(createStreamMessage, txOptions);
    console.log(`Stream creation tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Stream created in block: ${receipt.blockNumber}`);

    // Parse event
    const event = receipt.logs
        .map(log => {
            try {
                return streamFactory.interface.parseLog(log);
            } catch {
                return null;
            }
        })
        .find(log => log && log.name === "StreamCreated");

    if (event) {
        const streamAddress = event.args[11];
        const streamId = event.args[12];
        console.log(`New Stream Address: ${streamAddress} (ID: ${streamId})`);
    } else {
        console.error("StreamCreated event not found in logs");
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
