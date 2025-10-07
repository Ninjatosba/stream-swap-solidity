import { ethers } from "hardhat";

// Canonical mainnet addresses
const V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const V3_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

export interface V2WrapperFixtureResult {
    wrapperAddress: string;
    factoryAddress: string;
    routerAddress: string;
}

export interface V3WrapperFixtureResult {
    wrapperAddress: string;
    factoryAddress: string;
    positionManagerAddress: string;
    feeTier: number;
}

export async function deployV2PoolWrapperFork(): Promise<V2WrapperFixtureResult> {
    const Wrapper = await ethers.getContractFactory("V2PoolWrapper");
    const wrapper = await Wrapper.deploy(V2_FACTORY, V2_ROUTER);
    await wrapper.waitForDeployment();

    return {
        wrapperAddress: await wrapper.getAddress(),
        factoryAddress: V2_FACTORY,
        routerAddress: V2_ROUTER,
    };
}

export async function deployV3PoolWrapperFork(feeTier: number = 3000): Promise<V3WrapperFixtureResult> {
    const Wrapper = await ethers.getContractFactory("V3PoolWrapper");
    const wrapper = await Wrapper.deploy(V3_FACTORY, V3_POSITION_MANAGER, feeTier);
    await wrapper.waitForDeployment();

    return {
        wrapperAddress: await wrapper.getAddress(),
        factoryAddress: V3_FACTORY,
        positionManagerAddress: V3_POSITION_MANAGER,
        feeTier,
    };
}


