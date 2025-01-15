import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys the Stream contract and a Mock ERC-20 Token contract for testing.
 */
const deployStreamContract: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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

    // Step 1: Deploy the ERC-20 Token (Mock)
    const erc20 = await deploy("ERC20Mock", {
      from: deployer,
      args: [], // Adjust if necessary
      log: true,
    });
    console.log("ERC20 Mock Token deployed at:", erc20.address);

    // Mint tokens for the deployer (1000 tokens in this case)
    const erc20Contract = await hre.ethers.getContractAt("ERC20Mock", erc20.address);
    await erc20Contract.mint(deployer, 1000);

    // Step 2: Deploy the Stream contract, passing the address of the ERC-20 token
    const stream = await deploy("Stream", {
      from: deployer,
      args: [],
      log: true,
    });
    console.log("Stream contract deployed at:", stream.address);

    // Step 3: Set up allowance for the stream contract to spend tokens
    const amountToApprove = 1000; // Example: approve 1000 tokens for the Stream contract
    const approveTx = await erc20Contract.approve(stream.address, amountToApprove);
    await approveTx.wait();

    // Step 4: Create the stream by calling the createStream function
    const streamContract = await hre.ethers.getContractAt("Stream", stream.address);
    const createStreamTx = await streamContract.createStream(
      amountToApprove,
      bootstrappingStartTime,
      streamStartTime,
      streamEndTime,
      1000, // Example threshold
      "Test Stream",
      erc20.address
    );
    await createStreamTx.wait();
    console.log(`Stream is created`);

    // Query data 
    const StreamFlag = await streamContract.streamCreated();
    console.log(`Stream flag is ${StreamFlag}`);
    // Query token balance of the stream contract
    const tokenBalance = await erc20Contract.balanceOf(stream.address);
    console.log(`Token balance of the stream contract is ${tokenBalance}`);

    // Query stream out amount
    const streamOutAmount = await streamContract.streamOutAmount();
    console.log(`Stream out amount is ${streamOutAmount}`);

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
