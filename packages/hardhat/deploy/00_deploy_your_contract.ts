import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys the Stream contract and a Mock ERC-20 Token contract for testing.
 */const deployStreamContract: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  try {
    let nowSeconds = Math.floor(Date.now() / 1000);
    let waitSeconds = 3000;
    let bootstrappingDuration = 6000;
    let streamDuration = 6000;

    let bootstrappingStartTime = nowSeconds + waitSeconds;
    let streamStartTime = bootstrappingStartTime + bootstrappingDuration;
    let streamEndTime = streamStartTime + streamDuration;

    let streamOutAmount = 1000;

    // Deploy inDenom ERC20 Mock token
    const inDenom = await deploy("ERC20Mock", {
      from: deployer,
      args: ["InDenom Token", "IN"],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log("InDenom Mock Token deployed at:", inDenom.address);

    // Deploy streamOutDenom ERC20 Mock token
    const streamOutDenom = await deploy("ERC20Mock", {
      from: deployer,
      args: ["StreamOutDenom Token", "OUT"],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log("StreamOutDenom Mock Token deployed at:", streamOutDenom.address);

    // Ensure inDenom and streamOutDenom are not the same
    if (inDenom.address === streamOutDenom.address) {
      throw new Error("inDenom and streamOutDenom should not be the same address.");
    }

    // Mint tokens for the deployer as the streamOutAmount
    const streamOutDenomContract = await hre.ethers.getContractAt("ERC20Mock", streamOutDenom.address);
    await streamOutDenomContract.mint(deployer, streamOutAmount);
    console.log(`Minted ${streamOutAmount} tokens for deployer`);

    // Deploy Stream contract
    const stream = await deploy("Stream", {
      from: deployer,
      args: [],
      log: true,
      skipIfAlreadyDeployed: false,
      deterministicDeployment: false,
    });
    console.log("Stream contract deployed at:", stream.address);

    // Set up allowance for the Stream contract to spend streamOutDenom tokens
    const approveTx = await streamOutDenomContract.approve(stream.address, streamOutAmount);
    await approveTx.wait();
    console.log(`Approved ${streamOutAmount} tokens for Stream contract`);

    // Call createStream function
    const streamContract = await hre.ethers.getContractAt("Stream", stream.address);

    console.log("createStream arguments:");
    console.log({
      streamOutAmount,
      streamOutDenom: streamOutDenom.address,
      bootstrappingStartTime,
      streamStartTime,
      streamEndTime,
      threshold: 1000, // Example threshold
      name: "Test Stream",
      inDenom: inDenom.address,
    });
    const createStreamTx = await streamContract.createStream(
      streamOutAmount,
      streamOutDenom.address, // streamOutDenom
      bootstrappingStartTime,
      streamStartTime,
      streamEndTime,
      1000, // Example threshold
      "Test Stream",
      inDenom.address // inDenom
    );
    await createStreamTx.wait();
    console.log(`Stream is created`);

    // Query stream data
    const StreamFlag = await streamContract.streamCreated();
    console.log(`Stream flag is ${StreamFlag}`);

    const tokenBalance = await streamOutDenomContract.balanceOf(stream.address);
    console.log(`Token balance of the stream contract is ${tokenBalance}`);

    const streamState = await streamContract.streamState();
    console.log(`Stream state is ${streamState}`);

    const streamStatus = await streamContract.streamStatus();
    console.log(`Stream status is ${streamStatus}`);

  } catch (error: unknown) {
    console.error("Error deploying contract:", error);
    if (error instanceof Error) {
      console.error("Revert reason:", error.message);
    } else {
      console.error("Unknown error occurred");
    }
  }
};

export default deployStreamContract;
