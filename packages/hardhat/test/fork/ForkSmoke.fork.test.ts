import { expect } from "chai";
import { ethers } from "hardhat";
import { enableMainnetFork } from "../helpers/fork";

describe("Mainnet fork smoke", function () {
    before(async function () {
        // Enable fork only for this test file
        try {
            await enableMainnetFork();
        } catch (e) {
            this.skip();
        }
    });

    it("sees Uniswap v3 factory code", async function () {
        const V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
        const code = await ethers.provider.getCode(V3_FACTORY);
        expect(code).to.not.equal("0x");
    });

    it("sees Uniswap v2 router code", async function () {
        const V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
        const code = await ethers.provider.getCode(V2_ROUTER);
        expect(code).to.not.equal("0x");
    });
});


