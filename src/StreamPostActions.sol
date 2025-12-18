// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StreamPostActions
 * @author Adnan Deniz Corlu (@Ninjatosba)
 * @notice Stream implementation that supports both vesting and pool creation
 * @dev Consolidates logic formerly split across StreamWithVesting/StreamWithPool/StreamFull.
 */

import { StreamCore } from "./StreamCore.sol";
import { StreamTypes } from "./types/StreamTypes.sol";
import { StreamFactoryTypes } from "./types/StreamFactoryTypes.sol";
import { IStreamFactoryParams } from "./interfaces/IStreamFactoryParams.sol";
import { IVestingFactory } from "./interfaces/IVestingFactory.sol";
import { PoolWrapperTypes } from "./types/PoolWrapperTypes.sol";
import { DecimalMath, Decimal } from "./lib/math/DecimalMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TransferLib } from "./lib/TransferLib.sol";
import { PoolOps } from "./lib/PoolOps.sol";

contract StreamPostActions is StreamCore {
    using PoolOps for *;

    string public constant VERSION = "1.0.0";
    string public constant VARIANT = "PostActions";

    // ============ State ============
    /// @notice Post-stream actions like vesting and pool creation (variant-specific)
    StreamTypes.PostStreamActions public postStreamActions;
    
    // ============ Getters ============
    function getPostStreamActions() external view override returns (StreamTypes.PostStreamActions memory) {
        return postStreamActions;
    }

    // ============ Override Hooks ============

    function _onInitialize(StreamTypes.CreateStreamMessage memory createStreamMessage) internal override {
        // Validate vesting configurations
        if (createStreamMessage.creatorVesting.isVestingEnabled) {
            if (createStreamMessage.creatorVesting.vestingDuration == 0) {
                revert InvalidVestingDuration();
            }
        }
        if (createStreamMessage.beneficiaryVesting.isVestingEnabled) {
            if (createStreamMessage.beneficiaryVesting.vestingDuration == 0) {
                revert InvalidVestingDuration();
            }
        }

        // Validate pool config if enabled
        if (createStreamMessage.poolInfo.poolOutSupplyAmount > 0) {
            if (createStreamMessage.poolInfo.poolOutSupplyAmount > createStreamMessage.streamOutAmount) {
                revert InvalidPoolOutSupplyAmount();
            }
            if (
                createStreamMessage.poolInfo.dexType != StreamTypes.DexType.V2
                    && createStreamMessage.poolInfo.dexType != StreamTypes.DexType.V3
                    && createStreamMessage.poolInfo.dexType != StreamTypes.DexType.Aerodrome
            ) {
                revert InvalidPoolType();
            }
        }

        // Store post-stream actions for this variant
        postStreamActions = StreamTypes.PostStreamActions({
            poolInfo: createStreamMessage.poolInfo,
            creatorVesting: createStreamMessage.creatorVesting,
            beneficiaryVesting: createStreamMessage.beneficiaryVesting
        });
    }

    function _afterFinalizeSuccess(uint256 creatorRevenue, uint256 outRemaining) internal override returns (uint256 adjustedCreatorRevenue) {
        adjustedCreatorRevenue = creatorRevenue;

        if (postStreamActions.poolInfo.poolOutSupplyAmount > 0) {
            // Compute pool in-supply allocation proportional to out-supply allocation
            Decimal memory poolRatio = DecimalMath.div(
                DecimalMath.fromNumber(postStreamActions.poolInfo.poolOutSupplyAmount),
                DecimalMath.fromNumber(streamState.outSupply)
            );
            uint256 poolInSupplyAmount = DecimalMath.floor(DecimalMath.mul(DecimalMath.fromNumber(creatorRevenue), poolRatio));
            uint256 poolOutSupplyAmount = postStreamActions.poolInfo.poolOutSupplyAmount;

            if (poolInSupplyAmount > 0) {
                _createPoolAndAddLiquidity(
                    streamTokens.inToken.tokenAddress,
                    streamTokens.outToken.tokenAddress,
                    poolInSupplyAmount,
                    poolOutSupplyAmount,
                    postStreamActions.poolInfo.dexType,
                    creator
                );
                adjustedCreatorRevenue = creatorRevenue - poolInSupplyAmount;
            }
        }

        // Transfer or vest the adjusted creator revenue
        if (postStreamActions.creatorVesting.isVestingEnabled && adjustedCreatorRevenue > 0) {
            _createCreatorVesting(adjustedCreatorRevenue);
        } else if (adjustedCreatorRevenue > 0) {
            TransferLib.transferFunds(streamTokens.inToken.tokenAddress, address(this), creator, adjustedCreatorRevenue);
        }

        // Transfer any remaining output tokens to creator
        if (outRemaining > 0) {
            TransferLib.transferFunds(streamTokens.outToken.tokenAddress, address(this), creator, outRemaining);
        }
        return adjustedCreatorRevenue;
    }

    /**
     * @dev Hook called when a user exits successfully (threshold met)
     */
    function _onExitSuccess(address user, uint256 purchased, uint256 inRefunded) internal override {
        // Refund unused input tokens
        if (inRefunded > 0) {
            TransferLib.transferFunds(streamTokens.inToken.tokenAddress, address(this), user, inRefunded);
        }

        // Vest or transfer purchased output tokens
        if (postStreamActions.beneficiaryVesting.isVestingEnabled && purchased > 0) {
            _createBeneficiaryVesting(user, purchased);
        } else if (purchased > 0) {
            TransferLib.transferFunds(streamTokens.outToken.tokenAddress, address(this), user, purchased);
        }
    }

    // ============ Internal Helper Functions ============

    function _createPoolAndAddLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        StreamTypes.DexType dexType,
        address streamCreator
    ) internal {
        address router = factoryParamsSnapshot.poolRouterAddress;
        if (router == address(0)) revert InvalidDexType();

        // Pre-fund router
        TransferLib.transferFunds(tokenA, address(this), router, amountADesired);
        TransferLib.transferFunds(tokenB, address(this), router, amountBDesired);

        (address token0, address token1, uint256 amount0Desired, uint256 amount1Desired) =
            PoolOps.sortTokensWithAmounts(tokenA, tokenB, amountADesired, amountBDesired);

        PoolWrapperTypes.CreatedPoolInfo memory createdPoolInfo = PoolOps.createPoolViaRouter(
            router, token0, amount0Desired, token1, amount1Desired, dexType, postStreamActions.poolInfo.extra, streamCreator
        );

        (uint256 refundedOut, uint256 refundedIn) =
            PoolOps.mapRefundsToInOut(createdPoolInfo, streamTokens.inToken.tokenAddress, streamTokens.outToken.tokenAddress);

        emit PoolCreated(
            address(this),
            createdPoolInfo.poolAddress,
            createdPoolInfo.token0,
            createdPoolInfo.token1,
            createdPoolInfo.amount0,
            createdPoolInfo.amount1,
            refundedOut,
            refundedIn,
            createdPoolInfo.creator
        );
    }

    function _createBeneficiaryVesting(address beneficiary, uint256 amount) internal {
        IVestingFactory vestingFactory = IVestingFactory(factoryParamsSnapshot.vestingFactoryAddress);
        IERC20(streamTokens.outToken.tokenAddress).approve(factoryParamsSnapshot.vestingFactoryAddress, amount);
        address vestingAddress = vestingFactory.createVestingWalletWithTokens(
            beneficiary, uint64(block.timestamp), postStreamActions.beneficiaryVesting.vestingDuration, streamTokens.outToken.tokenAddress, amount
        );
        emit BeneficiaryVestingCreated(beneficiary, vestingAddress, postStreamActions.beneficiaryVesting.vestingDuration, streamTokens.outToken.tokenAddress, amount);
    }

    function _createCreatorVesting(uint256 amount) internal {
        IVestingFactory vestingFactory = IVestingFactory(factoryParamsSnapshot.vestingFactoryAddress);
        IERC20(streamTokens.inToken.tokenAddress).approve(factoryParamsSnapshot.vestingFactoryAddress, amount);
        address vestingAddress = vestingFactory.createVestingWalletWithTokens(
            creator, uint64(block.timestamp), postStreamActions.creatorVesting.vestingDuration, streamTokens.inToken.tokenAddress, amount
        );
        emit CreatorVestingCreated(creator, vestingAddress, postStreamActions.creatorVesting.vestingDuration, streamTokens.inToken.tokenAddress, amount);
    }
}


