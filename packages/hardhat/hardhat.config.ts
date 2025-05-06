import * as dotenv from "dotenv";
dotenv.config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import { task } from "hardhat/config";
import generateTsAbis from "./scripts/generateTsAbis";
import path from "path";
import fs from "fs";
// If not set, it uses ours Alchemy's default API key.
// You can get your own at https://dashboard.alchemyapi.io
const providerApiKey = process.env.ALCHEMY_API_KEY || "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";
// If not set, it uses the hardhat account 0 private key.
// You can generate a random account with `yarn generate` or `yarn account:import` to import your existing PK
const deployerPrivateKey =
  process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY ?? "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const creatorPrivateKey =
  process.env.__RUNTIME_CREATOR_PRIVATE_KEY ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const subscriber1PrivateKey =
  process.env.__RUNTIME_SUBSCRIBER1_PRIVATE_KEY ?? "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const subscriber2PrivateKey =
  process.env.__RUNTIME_SUBSCRIBER2_PRIVATE_KEY ?? "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
// If not set, it uses our block explorers default API keys.
const etherscanApiKey = process.env.ETHERSCAN_MAINNET_API_KEY || "DNXJA8RX2Q3VZ4URQIWP7Z68CJXQZSC6AW";
const etherscanOptimisticApiKey = process.env.ETHERSCAN_OPTIMISTIC_API_KEY || "RM62RDISS1RH448ZY379NX625ASG1N633R";
const basescanApiKey = process.env.BASESCAN_API_KEY || "ZZZEIPMT1MNJ8526VV2Y744CA7TNZR64G6";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            // https://docs.soliditylang.org/en/latest/using-the-compiler.html#optimizer-options
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  mocha: {
    timeout: 100000, // 100 seconds max for running tests
  },
  namedAccounts: {
    deployer: {
      // By default, it will take the first Hardhat account as the deployer
      default: 0,
    },
    creator: {
      default: 1, // Use the same account as deployer for testing
    },
    subscriber1: {
      default: 2,
    },
    subscriber2: {
      default: 3,
    },
  },
  networks: {
    // View the networks that are pre-configured.
    // If the network you are looking for is not here you can add new network settings
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${providerApiKey}`,
        enabled: process.env.MAINNET_FORKING_ENABLED === "true",
        blockNumber: 19000000 // Fork from a recent block
      },
      mining: {
        auto: true,
        interval: 0  // Add a 1 second interval between blocks
      }
    },
    monadTestnet: {
      url: "https://testnet-rpc.monad.xyz",
      accounts: [deployerPrivateKey, creatorPrivateKey, subscriber1PrivateKey, subscriber2PrivateKey],
      chainId: 10143,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      // The following are optional but might be needed depending on your setup
      timeout: 60000,
      mining: {
        auto: true,
        interval: 0  // Add a 1 second interval between blocks
      },
      chainId: 31337
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
      timeout: 1800000,
      gas: "auto",
      gasPrice: "auto",
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey, creatorPrivateKey, subscriber1PrivateKey, subscriber2PrivateKey],
    },
    arbitrum: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    arbitrumSepolia: {
      url: `https://arb-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    optimism: {
      url: `https://opt-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
      verify: {
        etherscan: {
          apiUrl: "https://api-optimistic.etherscan.io",
          apiKey: etherscanOptimisticApiKey,
        },
      },
    },
    optimismSepolia: {
      url: `https://opt-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
      verify: {
        etherscan: {
          apiUrl: "https://api-sepolia-optimistic.etherscan.io",
          apiKey: etherscanOptimisticApiKey,
        },
      },
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    polygonMumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    polygonZkEvm: {
      url: `https://polygonzkevm-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    polygonZkEvmTestnet: {
      url: `https://polygonzkevm-testnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    gnosis: {
      url: "https://rpc.gnosischain.com",
      accounts: [deployerPrivateKey],
    },
    chiado: {
      url: "https://rpc.chiadochain.net",
      accounts: [deployerPrivateKey],
    },
    base: {
      url: "https://mainnet.base.org",
      accounts: [deployerPrivateKey],
      verify: {
        etherscan: {
          apiUrl: "https://api.basescan.org",
          apiKey: basescanApiKey,
        },
      },
    },
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: [deployerPrivateKey],
      verify: {
        etherscan: {
          apiUrl: "https://api-sepolia.basescan.org",
          apiKey: basescanApiKey,
        },
      },
    },
    scrollSepolia: {
      url: "https://sepolia-rpc.scroll.io",
      accounts: [deployerPrivateKey],
    },
    scroll: {
      url: "https://rpc.scroll.io",
      accounts: [deployerPrivateKey],
    },
    pgn: {
      url: "https://rpc.publicgoods.network",
      accounts: [deployerPrivateKey],
    },
    pgnTestnet: {
      url: "https://sepolia.publicgoods.network",
      accounts: [deployerPrivateKey],
    },
    celo: {
      url: "https://forno.celo.org",
      accounts: [deployerPrivateKey],
    },
    celoAlfajores: {
      url: "https://alfajores-forno.celo-testnet.org",
      accounts: [deployerPrivateKey],
    },
    hyperliquidTestnet: {
      url: "https://rpc.hyperliquid-testnet.xyz/evm",
      accounts: [deployerPrivateKey, creatorPrivateKey, subscriber1PrivateKey, subscriber2PrivateKey],
      gas: 50_000_000,  // Increased gas limit
      gasPrice: "auto",
      blockGasLimit: 50_000_000,
      allowUnlimitedContractSize: true
    },
  },
  // configuration for harhdat-verify plugin
  etherscan: {
    apiKey: `${etherscanApiKey}`,
  },
  // configuration for etherscan-verify from hardhat-deploy plugin
  verify: {
    etherscan: {
      apiKey: `${etherscanApiKey}`,
    },
  },
  sourcify: {
    enabled: false,
  },
};

// Extend the deploy task
task("deploy").setAction(async (args, hre, runSuper) => {
  // Run the original deploy task
  await runSuper(args);
  // Force run the generateTsAbis script
  await generateTsAbis(hre);
});

task('sync-abis', 'Syncs ABIs with the indexer').setAction(async () => {
  const sourceDir = './artifacts/contracts';
  const targetDir = '../indexer/abis';

  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ Source directory ${sourceDir} does not exist!`);
    return;
  }

  if (!fs.existsSync(targetDir)) {
    console.log(`📁 Creating target directory ${targetDir}`);
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Recursive function to find all .json files
  const findJsonFiles = (dir: string): string[] => {
    let results: string[] = [];
    const items = fs.readdirSync(dir);

    items.forEach((item) => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        results = results.concat(findJsonFiles(fullPath));
      } else if (item.endsWith('.json') && !item.endsWith('.dbg.json')) {
        // Skip debug files and only include main artifact files
        results.push(fullPath);
      }
    });

    return results;
  };

  try {
    const jsonFiles = findJsonFiles(sourceDir);
    console.log(`Found ${jsonFiles.length} JSON files`);

    let copiedFiles = 0;
    jsonFiles.forEach((sourcePath) => {
      // Get just the contract name for the target file
      const fileName = path.basename(sourcePath);
      const targetPath = path.join(targetDir, fileName);

      try {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✓ Copied ${fileName}`);
        copiedFiles++;
      } catch (error) {
        console.error(`❌ Error copying ${fileName}:`, error);
      }
    });

    if (copiedFiles === 0) {
      console.warn('⚠️ No ABI files copied!');
    } else {
      console.log(`✅ Successfully copied ${copiedFiles} ABI files to indexer`);
    }
  } catch (error) {
    console.error('❌ Error processing files:', error);
  }
});



export default config;
