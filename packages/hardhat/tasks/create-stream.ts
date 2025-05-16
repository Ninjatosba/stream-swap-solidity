import { task } from "hardhat/config";
import { defaultStreamConfig } from "../deploy/config/stream-config";
import { Log } from "ethers";
import { StreamFactory, ERC20Mock } from "../typechain-types";

task("create-stream", "Creates a new stream using the deployed factory")
    .setAction(async (_, hre) => {
        const { deployments, ethers } = hre;

        // Get deployment addresses
        const streamFactoryDeployment = await deployments.get("StreamFactory");
        const inTokenDeployment = await deployments.get("InToken");
        const outTokenDeployment = await deployments.get("OutToken");

        const streamFactoryAddress = streamFactoryDeployment.address;
        const inTokenAddress = inTokenDeployment.address;
        const outTokenAddress = outTokenDeployment.address;

        // Get accounts
        const [deployer, creator] = await ethers.getSigners();
        console.log(`Deployer: ${deployer.address}`);
        console.log(`Creator: ${creator.address}`);

        // Get contract instances with proper types
        const StreamFactoryContract = await ethers.getContractFactory("StreamFactory");
        const streamFactory = StreamFactoryContract.attach(streamFactoryAddress) as unknown as StreamFactory;
        const ERC20MockContract = await ethers.getContractFactory("ERC20Mock");
        const outToken = ERC20MockContract.attach(outTokenAddress) as unknown as ERC20Mock;

        // Check creator's output token balance
        const creatorOutTokenBalance = await outToken.balanceOf(creator.address);
        console.log(`Creator's output token balance: ${creatorOutTokenBalance}`);
        if (creatorOutTokenBalance < BigInt(defaultStreamConfig.streamOutAmount)) {
            throw new Error("Insufficient output token balance");
        }

        // Approve tokens if needed
        const allowance = await outToken.allowance(creator.address, streamFactoryAddress);
        if (allowance < BigInt(defaultStreamConfig.streamOutAmount)) {
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
        const latestBlock = await ethers.provider.getBlock("latest");
        const nowSeconds = latestBlock?.timestamp ?? 0;
        const bootstrappingStartTime = nowSeconds + 20;
        const streamStartTime = nowSeconds + 6500;
        const streamEndTime = nowSeconds + 206500;

        // Prepare stream creation message
        const salt = ethers.hexlify(ethers.randomBytes(32));
        const createStreamMessage = {
            streamOutAmount: defaultStreamConfig.streamOutAmount,
            outSupplyToken: outTokenAddress,
            bootstrappingStartTime,
            streamStartTime,
            streamEndTime,
            threshold: defaultStreamConfig.threshold,
            metadata: { ipfsHash: "QmS4ghgMgPXqX53EiQ7sP8G6QY8Y5X53EiQ7sP8G6Q" },
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

        if (!receipt) {
            throw new Error("Transaction receipt is null");
        }

        console.log(`Stream created in block: ${receipt.blockNumber}`);

        // Parse event
        const event = receipt.logs
            .map((log: Log) => {
                try {
                    return streamFactory.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .find((log: any) => log && log.name === "StreamCreated");

        if (event) {
            // Access event arguments by their correct names from the event definition
            const streamAddress = event.args.streamAddress;
            const streamId = event.args.streamId;
            console.log(`New Stream Address: ${streamAddress} (ID: ${streamId})`);
        } else {
            console.error("StreamCreated event not found in logs");
        }
    }); 