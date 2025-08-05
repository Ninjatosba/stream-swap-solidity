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
import "./tasks/create-stream";
import "./tasks/mint-tokens";
import "./tasks/subscribe";
import "./tasks/finalize-stream";
import "./tasks/exit-stream";
import "./tasks/withdraw";
import "./tasks/get-stream-status";
// If not set, it uses ours Alchemy's default API key.
// You can get your own at https://dashboard.alchemyapi.io
const providerApiKey = process.env.ALCHEMY_API_KEY;
if (!providerApiKey) {
  throw new Error("ALCHEMY_API_KEY environment variable is not set.");
}

// If not set, it uses the hardhat account 0 private key.
// You can generate a random account with `yarn generate` or `yarn account:import` to import your existing PK
const deployerPrivateKey = process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
const creatorPrivateKey = process.env.CREATOR_PRIVATE_KEY;
const subscriber1PrivateKey = process.env.SUBSCRIBER1_PRIVATE_KEY;
const subscriber2PrivateKey = process.env.SUBSCRIBER2_PRIVATE_KEY;

// If not set, it uses our block explorers default API keys.
const etherscanApiKey = process.env.ETHERSCAN_MAINNET_API_KEY || "";
const etherscanOptimisticApiKey = process.env.ETHERSCAN_OPTIMISTIC_API_KEY || "";
const basescanApiKey = process.env.BASESCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
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
  paths: {
    sources: "./src",
    deploy: "deploy",
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
        blockNumber: 19525330,
      },
      mining: {
        auto: true,
        interval: 0, // Add a 1 second interval between blocks
      },
    },
    monadTestnet: {
      url: "https://testnet-rpc.monad.xyz",
      accounts: [deployerPrivateKey, creatorPrivateKey, subscriber1PrivateKey, subscriber2PrivateKey].filter(
        (account): account is string => !!account,
      ),
      chainId: 10143,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      // The following are optional but might be needed depending on your setup
      timeout: 60000,
      mining: {
        auto: true,
        interval: 1, // Add a 1 second interval between blocks
      },
      chainId: 31337,
      gas: "auto",
      gasPrice: "auto",
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      timeout: 1800000,
      gas: "auto",
      gasPrice: "auto",
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey, creatorPrivateKey, subscriber1PrivateKey, subscriber2PrivateKey].filter(
        (account): account is string => !!account,
      ),
    },
    arbitrum: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      verify: {
        etherscan: {
          apiUrl: "https://api-optimistic.etherscan.io",
          apiKey: etherscanOptimisticApiKey,
        },
      },
    },
    arbitrumSepolia: {
      url: `https://arb-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    optimism: {
      url: `https://opt-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      verify: {
        etherscan: {
          apiUrl: "https://api-optimistic.etherscan.io",
          apiKey: etherscanOptimisticApiKey,
        },
      },
    },
    optimismSepolia: {
      url: `https://opt-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      verify: {
        etherscan: {
          apiUrl: "https://api-sepolia-optimistic.etherscan.io",
          apiKey: etherscanOptimisticApiKey,
        },
      },
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      verify: {
        etherscan: {
          apiUrl: "https://api.basescan.org",
          apiKey: basescanApiKey,
        },
      },
    },
    polygonMumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    polygonZkEvm: {
      url: `https://polygonzkevm-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    polygonZkEvmTestnet: {
      url: `https://polygonzkevm-testnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    gnosis: {
      url: "https://rpc.gnosischain.com",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    chiado: {
      url: "https://rpc.chiadochain.net",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    base: {
      url: "https://mainnet.base.org",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      verify: {
        etherscan: {
          apiUrl: "https://api.basescan.org",
          apiKey: basescanApiKey,
        },
      },
    },
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: deployerPrivateKey ? [deployerPrivateKey, creatorPrivateKey, subscriber1PrivateKey, subscriber2PrivateKey].filter(
        (account): account is string => !!account,
      ) : [],
      verify: {
        etherscan: {
          apiUrl: "https://api-sepolia.basescan.org",
          apiKey: basescanApiKey,
        },
      },
    },
    scrollSepolia: {
      url: "https://sepolia-rpc.scroll.io",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    scroll: {
      url: "https://rpc.scroll.io",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    pgn: {
      url: "https://rpc.publicgoods.network",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    pgnTestnet: {
      url: "https://sepolia.publicgoods.network",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    celo: {
      url: "https://forno.celo.org",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    celoAlfajores: {
      url: "https://alfajores-forno.celo-testnet.org",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    hyperliquidTestnet: {
      url: "https://rpc.hyperliquid-testnet.xyz/evm",
      accounts: [deployerPrivateKey, creatorPrivateKey, subscriber1PrivateKey, subscriber2PrivateKey].filter(
        (account): account is string => !!account,
      ),
      gas: 50_000_000, // Increased gas limit
      gasPrice: "auto",
      blockGasLimit: 50_000_000,
      allowUnlimitedContractSize: true,
    },
    cosmosEvmDevnet: {
      url: "https://devnet-1-evmrpc.ib.skip.build",
      accounts: [deployerPrivateKey, creatorPrivateKey, subscriber1PrivateKey, subscriber2PrivateKey].filter(
        (account): account is string => !!account,
      ),
      chainId: 4231,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: etherscanApiKey,
      sepolia: etherscanApiKey,
      optimisticEthereum: etherscanOptimisticApiKey,
      "base-sepolia": basescanApiKey,
      monadTestnet: "your_monad_api_key", // Monad doesn't have a verifier yet
      hyperliquidTestnet: "your_hyperliquid_api_key", // Hyperliquid doesn't have a verifier yet
    },
    customChains: [
      {
        network: "optimismSepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://sepolia-optimism.etherscan.io",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "scrollSepolia",
        chainId: 534351,
        urls: {
          apiURL: "https://api-sepolia.scrollscan.com/api",
          browserURL: "https://sepolia.scrollscan.com",
        },
      },
      {
        network: "monadTestnet",
        chainId: 10143,
        urls: {
          apiURL: "https://api.monad.xyz/api",
          browserURL: "https://monad.xyz",
        },
      },
    ],
  },
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
});

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

export default config;
