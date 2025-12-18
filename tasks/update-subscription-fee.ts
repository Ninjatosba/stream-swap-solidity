import { task } from "hardhat/config";
import { ethers } from "hardhat";
import { StreamFactory } from "../typechain-types";

const MAX_SUBSCRIPTION_FEE = 1_000_000n; // 100% with 6 decimal precision (1e6 = 100%)

task("update-subscription-fee", "Update subscription fee ratio in StreamFactory")
    .addParam("subFee", "Subscription fee ratio in ppm (1e6 = 100%)")
    .addOptionalParam("adminPk", "Protocol admin private key (hex string, no 0x needed or with 0x)")
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;

        try {
            const parsedFee = (() => {
                try {
                    return BigInt(taskArgs.subFee);
                } catch {
                    throw new Error(`--sub-fee must be an integer value in ppm (received: ${taskArgs.subFee})`);
                }
            })();

            if (parsedFee < 0n) {
                throw new Error("--sub-fee cannot be negative");
            }
            if (parsedFee > MAX_SUBSCRIPTION_FEE) {
                throw new Error(`--sub-fee cannot exceed ${MAX_SUBSCRIPTION_FEE} (100%)`);
            }

            const streamFactoryDeployment = await deployments.get("StreamFactory");
            const streamFactoryAddress = streamFactoryDeployment.address;
            console.log(`StreamFactory address: ${streamFactoryAddress}`);

            const streamFactory = (await ethers.getContractAt(
                "StreamFactory",
                streamFactoryAddress
            )) as unknown as StreamFactory;

            const factoryParams = await streamFactory.getParams();
            const protocolAdmin = factoryParams.protocolAdmin;
            const currentFee = factoryParams.subscriptionFeeRatio.value;
            console.log(`Protocol Admin: ${protocolAdmin}`);
            console.log(`Current subscription fee: ${currentFee.toString()} ppm (~${ethers.formatUnits(currentFee, 4)}%)`);

            const adminSigner = (() => {
                if (taskArgs.adminPk) {
                    const pk = taskArgs.adminPk.startsWith("0x") ? taskArgs.adminPk : `0x${taskArgs.adminPk}`;
                    const wallet = new ethers.Wallet(pk, ethers.provider);
                    if (wallet.address.toLowerCase() !== protocolAdmin.toLowerCase()) {
                        throw new Error(
                            `Provided --admin-pk resolves to ${wallet.address}, which is not the protocol admin ${protocolAdmin}`
                        );
                    }
                    return wallet;
                }

                return null;
            })();

            const signer =
                adminSigner ??
                (await ethers.getSigner(protocolAdmin).catch(() => {
                    throw new Error(
                        `Protocol admin ${protocolAdmin} is not managed by the connected node. ` +
                        "Pass --admin-pk <PRIVATE_KEY> or add the key to the network accounts."
                    );
                }));
            if (signer.address.toLowerCase() !== protocolAdmin.toLowerCase()) {
                throw new Error(
                    `Admin signer (${signer.address}) does not match protocol admin (${protocolAdmin}). ` +
                    "Use the correct account for this network."
                );
            }

            console.log(`\nUpdating subscription fee to ${parsedFee.toString()} ppm (~${ethers.formatUnits(parsedFee, 4)}%)...`);
            const tx = await streamFactory.connect(signer).updateSubscriptionFeeRatio({ value: parsedFee });
            console.log(`Transaction hash: ${tx.hash}`);
            console.log("Waiting for confirmation...");

            const receipt = await tx.wait();
            if (!receipt) {
                throw new Error("Transaction receipt is null");
            }

            console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);
            console.log(`Gas used: ${receipt.gasUsed?.toString()}`);

            const updatedParams = await streamFactory.getParams();
            const updatedFee = updatedParams.subscriptionFeeRatio.value;
            console.log(`\nUpdated subscription fee: ${updatedFee.toString()} ppm (~${ethers.formatUnits(updatedFee, 4)}%)`);
            console.log("🎉 Subscription fee updated successfully!");
        } catch (error: any) {
            console.error("\n❌ Error updating subscription fee:", {
                message: error.message,
                code: error.code,
                data: error.data,
                transaction: error.transaction,
            });
            throw error;
        }
    });

