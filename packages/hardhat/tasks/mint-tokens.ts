import { task } from "hardhat/config";
import { ethers, parseEther } from "ethers";
import { ERC20Mock } from "../typechain-types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { HttpNetworkConfig } from "hardhat/types";

// --- Minting Configuration ---
const config = {
  // Set to true to use token addresses from an old deployment.
  // Otherwise, it will use the latest deployments from the `deployments` folder.
  useOldDeploymentTokens: true,

  // Addresses for the old deployment tokens.
  oldDeployment: {
    inToken: "0x6db46c193dff3a6a411459e5a29e5307100f13a5", // Old InSupplyToken
    outToken: "0x5f3c9aa601fd828d61d352a14e164092c3b1d825", // Old OutSupplyToken
  },

  // A list of external addresses that almost always need tokens.
  // Add your addresses here with a descriptive comment.
  externalAddresses: {
    // My primary testing address for subscribing
    subscriber1: "0x8B4c7dE9b0d2847b6Ad1b2A1ABf8E4D79C982a8d",
    // My secondary testing address for subscribing
    subscriber2: "0x6B738b310f40279377De27815B33E6211EA540Ea",
    // My testing address for creating streams
    creator: "0x3C5630f986BA7806fDDf0E574481d92dCCB5ec93",
  },

  // Amounts to mint.
  inTokenAmount: parseEther("1000000"), // 1 million IN tokens.
  outTokenAmount: parseEther("10000000"), // 10 million OUT tokens.
};
// --- End of Configuration ---

task("mint-tokens", "Mints tokens to test accounts based on configuration").setAction(
  async (_, hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const networkConfig = hre.network.config as HttpNetworkConfig;
    const provider = new ethers.JsonRpcProvider(networkConfig.url);

    try {
      const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
      if (!deployerPrivateKey) {
        throw new Error("DEPLOYER_PRIVATE_KEY environment variable is not set.");
      }

      const { creator, subscriber1, subscriber2 } = await getNamedAccounts();
      const deployerWallet = new ethers.Wallet(deployerPrivateKey, provider);

      console.log(`Deployer: ${deployerWallet.address}`);
      console.log(`Deployer balance: ${await provider.getBalance(deployerWallet.address)}`);

      const accountsToMintFor = [
        { name: "local creator", address: creator, tokens: ["out"] },
        { name: "local subscriber1", address: subscriber1, tokens: ["in"] },
        { name: "local subscriber2", address: subscriber2, tokens: ["in"] },
        { name: "external creator", address: config.externalAddresses.creator, tokens: ["in", "out"] },
        { name: "external subscriber1", address: config.externalAddresses.subscriber1, tokens: ["in", "out"] },
        { name: "external subscriber2", address: config.externalAddresses.subscriber2, tokens: ["in", "out"] },
      ];

      console.log("\n--- Accounts to Mint For ---");
      for (const account of accountsToMintFor) {
        console.log(`- ${account.name} (${account.address}): [${account.tokens.join(", ")}]`);
      }
      console.log("--------------------------\n");

      let inTokenAddress: string;
      let outTokenAddress: string;

      if (config.useOldDeploymentTokens) {
        console.log("Using token addresses from old deployment...");
        try {
          inTokenAddress = ethers.getAddress(config.oldDeployment.inToken);
          outTokenAddress = ethers.getAddress(config.oldDeployment.outToken);
        } catch (error) {
          console.error("Error: Invalid address found in oldDeployment configuration.");
          if (error instanceof Error) {
            console.error(`- Details: ${error.message}`);
          }
          throw new Error("Please check the token addresses in the configuration.");
        }
      } else {
        console.log("Using token addresses from latest deployment...");
        try {
          const inTokenDeployment = await deployments.get("InToken");
          const outTokenDeployment = await deployments.get("OutToken");
          inTokenAddress = ethers.getAddress(inTokenDeployment.address);
          outTokenAddress = ethers.getAddress(outTokenDeployment.address);
        } catch (error) {
          console.error(
            "Failed to get token deployments. Make sure you're on the right network and tokens are deployed.",
          );
          throw error;
        }
      }

      console.log(`InToken at: ${inTokenAddress}`);
      console.log(`OutToken at: ${outTokenAddress}`);

      const erc20Abi = [
        "function mint(address to, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)",
      ];

      const inTokenContract = new ethers.Contract(inTokenAddress, erc20Abi, deployerWallet);
      const outTokenContract = new ethers.Contract(outTokenAddress, erc20Abi, deployerWallet);

      console.log("\nMinting tokens...");

      for (const account of accountsToMintFor) {
        const recipient = ethers.getAddress(account.address);
        if (account.tokens.includes("in")) {
          const tx = await inTokenContract.mint(recipient, config.inTokenAmount, { gasLimit: 500000 });
          console.log(`Minting IN tokens for ${account.name}. Transaction hash: ${tx.hash}`);
          await tx.wait();
          console.log(`-> Minted ${hre.ethers.formatEther(config.inTokenAmount)} IN tokens to ${account.name}`);
        }
        if (account.tokens.includes("out")) {
          const tx = await outTokenContract.mint(recipient, config.outTokenAmount, { gasLimit: 500000 });
          console.log(`Minting OUT tokens for ${account.name}. Transaction hash: ${tx.hash}`);
          await tx.wait();
          console.log(`-> Minted ${hre.ethers.formatEther(config.outTokenAmount)} OUT tokens to ${account.name}`);
        }
      }

      console.log("\n--- Final Balances ---");
      for (const account of accountsToMintFor) {
        const recipient = ethers.getAddress(account.address);
        const inBalance = await inTokenContract.balanceOf(recipient);
        const outBalance = await outTokenContract.balanceOf(recipient);
        console.log(
          `- ${account.name} (${recipient}):\n  IN: ${hre.ethers.formatEther(
            inBalance,
          )}, OUT: ${hre.ethers.formatEther(outBalance)}`,
        );
      }
      console.log("----------------------\n");

      console.log("Token minting process completed successfully.");
    } catch (error) {
      console.error("Error in mint-tokens task:", error);
      throw error;
    }
  },
);
