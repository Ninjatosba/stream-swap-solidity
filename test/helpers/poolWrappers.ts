import { ethers } from "hardhat";

// Canonical mainnet addresses (for fork mode)
const V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const V3_POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

// Base Mainnet addresses (for fork mode)
const AERODROME_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const AERODROME_STABLE = false;

// Mock addresses for local testing (non-fork mode)
// These are dummy addresses - the wrappers won't actually work but will pass validation
const MOCK_FACTORY = "0x0000000000000000000000000000000000000001";
const MOCK_ROUTER = "0x0000000000000000000000000000000000000002";
const MOCK_POSITION_MANAGER = "0x0000000000000000000000000000000000000003";

export interface AerodromeWrapperFixtureResult {
    wrapperAddress: string;
    factoryAddress: string;
    routerAddress: string;
    stable: boolean;
}

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
    const gasOverrides = { maxFeePerGas: ethers.parseUnits("100", "gwei"), maxPriorityFeePerGas: ethers.parseUnits("1", "gwei") };
    const Wrapper = await ethers.getContractFactory("V2PoolWrapper");
    const wrapper = await Wrapper.deploy(V2_FACTORY, V2_ROUTER, { ...gasOverrides });
    await wrapper.waitForDeployment();

    return {
        wrapperAddress: await wrapper.getAddress(),
        factoryAddress: V2_FACTORY,
        routerAddress: V2_ROUTER,
    };
}

export async function deployV3PoolWrapperFork(feeTier: number = 3000): Promise<V3WrapperFixtureResult> {
    const gasOverrides = { maxFeePerGas: ethers.parseUnits("100", "gwei"), maxPriorityFeePerGas: ethers.parseUnits("1", "gwei") };
    const Wrapper = await ethers.getContractFactory("V3PoolWrapper");
    const wrapper = await Wrapper.deploy(V3_FACTORY, V3_POSITION_MANAGER, feeTier, { ...gasOverrides });
    await wrapper.waitForDeployment();

    return {
        wrapperAddress: await wrapper.getAddress(),
        factoryAddress: V3_FACTORY,
        positionManagerAddress: V3_POSITION_MANAGER,
        feeTier,
    };
}

export async function deployAerodromePoolWrapperFork(stable: boolean = false): Promise<AerodromeWrapperFixtureResult> {
    const Wrapper = await ethers.getContractFactory("AerodromePoolWrapper");
    const wrapper = await Wrapper.deploy(AERODROME_FACTORY, AERODROME_ROUTER, stable);
    await wrapper.waitForDeployment();

    return {
        wrapperAddress: await wrapper.getAddress(),
        factoryAddress: AERODROME_FACTORY,
        routerAddress: AERODROME_ROUTER,
        stable,
    };
}

// ============ Mock Wrappers (for non-fork testing) ============
// These deploy real wrapper contracts but with dummy addresses.
// They won't work for actual pool creation but pass validation checks.

export async function deployV2PoolWrapperMock(): Promise<V2WrapperFixtureResult> {
    const Wrapper = await ethers.getContractFactory("V2PoolWrapper");
    const wrapper = await Wrapper.deploy(MOCK_FACTORY, MOCK_ROUTER);
    await wrapper.waitForDeployment();

    return {
        wrapperAddress: await wrapper.getAddress(),
        factoryAddress: MOCK_FACTORY,
        routerAddress: MOCK_ROUTER,
    };
}

export async function deployV3PoolWrapperMock(feeTier: number = 3000): Promise<V3WrapperFixtureResult> {
    const Wrapper = await ethers.getContractFactory("V3PoolWrapper");
    const wrapper = await Wrapper.deploy(MOCK_FACTORY, MOCK_POSITION_MANAGER, feeTier);
    await wrapper.waitForDeployment();

    return {
        wrapperAddress: await wrapper.getAddress(),
        factoryAddress: MOCK_FACTORY,
        positionManagerAddress: MOCK_POSITION_MANAGER,
        feeTier,
    };
}

export async function deployAerodromePoolWrapperMock(stable: boolean = false): Promise<AerodromeWrapperFixtureResult> {
    const Wrapper = await ethers.getContractFactory("AerodromePoolWrapper");
    const wrapper = await Wrapper.deploy(MOCK_FACTORY, MOCK_ROUTER, stable);
    await wrapper.waitForDeployment();

    return {
        wrapperAddress: await wrapper.getAddress(),
        factoryAddress: MOCK_FACTORY,
        routerAddress: MOCK_ROUTER,
        stable,
    };
}
