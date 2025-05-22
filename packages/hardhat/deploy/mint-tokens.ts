import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { parseEther } from "ethers";

/**
 * Mints tokens to addresses using existing token contracts.
 */
const mintTokens: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    try {
        // Get deployer account
        const { deployer, creator, subscriber1, subscriber2 } = await hre.getNamedAccounts();
        console.log(`Deployer address: ${deployer}`);
        console.log(`Creator address: ${creator}`);
        console.log(`Subscriber1 address: ${subscriber1}`);
        console.log(`Subscriber2 address: ${subscriber2}`);

        const { get } = hre.deployments;

        // Get existing token addresses
        console.log(`Getting existing token addresses...`);
        const inTokenDeployment = await get("InToken");
        const outTokenDeployment = await get("OutToken");

        console.log(`InToken at: ${inTokenDeployment.address}`);
        console.log(`OutToken at: ${outTokenDeployment.address}`);

        // Get contract instances
        const inTokenContract = await hre.ethers.getContractAt("ERC20Mock", inTokenDeployment.address);
        const outTokenContract = await hre.ethers.getContractAt("ERC20Mock", outTokenDeployment.address);

        // // Mint tokens
        // console.log("Minting in tokens for testing...");
        // const inTokenMintAmount = parseEther("1000000"); // 1 million tokens for testing
        // const inTokenMintTx = await inTokenContract.mint(subscriber1, inTokenMintAmount);
        // await inTokenMintTx.wait();
        // console.log(`Minted ${inTokenMintAmount} in tokens to subscriber1`);

        // console.log("Minting in tokens for testing...");
        // const inTokenMintAmount2 = parseEther("1000000"); // 1 million tokens for testing
        // const inTokenMintTx2 = await inTokenContract.mint(subscriber2, inTokenMintAmount2);
        // await inTokenMintTx2.wait();
        // console.log(`Minted ${inTokenMintAmount2} in tokens to subscriber2`);

        // console.log("Minting out tokens for testing...");
        // const outTokenMintAmount = parseEther("10000000");
        // const outTokenMintTx = await outTokenContract.mint(creator, outTokenMintAmount);
        // await outTokenMintTx.wait();
        // console.log(`Minted ${outTokenMintAmount} out tokens to creator`);
        // Add hard coded address and mint each token to the address
        const hardCodedAddress = "0x9aae2dc9a514dfd9f56657ace26ca66667d7a833";

        const inTokenMintAmount3 = parseEther("1000000"); // 1 million tokens for testing
        const inTokenMintTx3 = await inTokenContract.mint(hardCodedAddress, inTokenMintAmount3);
        await inTokenMintTx3.wait();
        console.log(`Minted ${inTokenMintAmount3} in tokens to hardCodedAddress`);

        const outTokenMintAmount2 = parseEther("10000000");
        const outTokenMintTx2 = await outTokenContract.mint(hardCodedAddress, outTokenMintAmount2);
        await outTokenMintTx2.wait();
        console.log(`Minted ${outTokenMintAmount2} out tokens to hardCodedAddress`);
        return true;
    } catch (error: unknown) {
        console.error("Token minting failed:", error instanceof Error ? error.message : error);
        throw error;
    }
};

// Add tags for selective deployment
mintTokens.tags = ['mint-tokens'];

// Add a unique ID for the deployment script
mintTokens.id = 'mint_tokens';

export default mintTokens; 