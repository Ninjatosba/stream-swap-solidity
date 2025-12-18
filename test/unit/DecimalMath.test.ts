import { expect } from "chai";
import { ethers } from "hardhat";
import { DecimalMathMock } from "../../typechain-types";

describe("DecimalMath", function () {
    let mock: DecimalMathMock;

    beforeEach(async function () {
        const DecimalMathMockFactory = await ethers.getContractFactory("DecimalMathMock");
        mock = await DecimalMathMockFactory.deploy();
    });

    describe("fromNumber", function () {
        it("should convert regular number to Decimal", async function () {
            const value = 100;
            const result = await mock.testFromNumber(value);
            expect(result.value).to.equal(BigInt(value) * 1000000n);
        });

        it("should handle zero", async function () {
            const result = await mock.testFromNumber(0);
            expect(result.value).to.equal(0);
        });

        it("should handle large numbers", async function () {
            const value = ethers.MaxUint256 / 1000000n;
            const result = await mock.testFromNumber(value);
            expect(result.value).to.equal(value * 1000000n);
        });
    });

    describe("toNumber", function () {
        it("should convert Decimal to number with remainder", async function () {
            const decimalValue = 100500000n; // 100.5 with 6 decimal places
            const [whole, remainder] = await mock.testToNumber({ value: decimalValue });
            expect(whole).to.equal(100);
            expect(remainder.value).to.equal(500000);
        });

        it("should handle exact division", async function () {
            const decimalValue = 100000000n; // 100.0 with 6 decimal places
            const [whole, remainder] = await mock.testToNumber({ value: decimalValue });
            expect(whole).to.equal(100);
            expect(remainder.value).to.equal(0);
        });

        it("should handle zero", async function () {
            const [whole, remainder] = await mock.testToNumber({ value: 0 });
            expect(whole).to.equal(0);
            expect(remainder.value).to.equal(0);
        });
    });

    describe("floor", function () {
        it("should return floor of decimal", async function () {
            const decimalValue = 100500000n; // 100.5
            const result = await mock.testFloor({ value: decimalValue });
            expect(result).to.equal(100);
        });

        it("should handle exact integers", async function () {
            const decimalValue = 100000000n; // 100.0
            const result = await mock.testFloor({ value: decimalValue });
            expect(result).to.equal(100);
        });

        it("should handle zero", async function () {
            const result = await mock.testFloor({ value: 0 });
            expect(result).to.equal(0);
        });
    });

    describe("ceil", function () {
        it("should return ceiling of decimal", async function () {
            const decimalValue = 100500000n; // 100.5
            const result = await mock.testCeil({ value: decimalValue });
            expect(result).to.equal(101);
        });

        it("should handle exact integers", async function () {
            const decimalValue = 100000000n; // 100.0
            const result = await mock.testCeil({ value: decimalValue });
            expect(result).to.equal(100);
        });

        it("should handle values just below integer", async function () {
            const decimalValue = 100999999n; // 100.999999
            const result = await mock.testCeil({ value: decimalValue });
            expect(result).to.equal(101);
        });

        it("should handle zero", async function () {
            const result = await mock.testCeil({ value: 0 });
            expect(result).to.equal(0);
        });
    });

    describe("mul", function () {
        it("should multiply two decimals", async function () {
            const a = { value: 2000000n }; // 2.0
            const b = { value: 3000000n }; // 3.0
            const result = await mock.testMul(a, b);
            expect(result.value).to.equal(6000000n); // 6.0
        });

        it("should handle multiplication with fractional result", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 1500000n }; // 1.5
            const result = await mock.testMul(a, b);
            expect(result.value).to.equal(1500000n); // 1.5
        });

        it("should handle zero multiplication", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 0 }; // 0.0
            const result = await mock.testMul(a, b);
            expect(result.value).to.equal(0);
        });
    });

    describe("mulScalar", function () {
        it("should multiply decimal by scalar", async function () {
            const a = { value: 2000000n }; // 2.0
            const scalar = 3;
            const result = await mock.testMulScalar(a, scalar);
            expect(result.value).to.equal(6000000n); // 6.0
        });

        it("should handle zero scalar", async function () {
            const a = { value: 1000000n }; // 1.0
            const scalar = 0;
            const result = await mock.testMulScalar(a, scalar);
            expect(result.value).to.equal(0);
        });
    });

    describe("div", function () {
        it("should divide two decimals", async function () {
            const a = { value: 6000000n }; // 6.0
            const b = { value: 2000000n }; // 2.0
            const result = await mock.testDiv(a, b);
            expect(result.value).to.equal(3000000n); // 3.0
        });

        it("should handle division with fractional result", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 3000000n }; // 3.0
            const result = await mock.testDiv(a, b);
            expect(result.value).to.equal(333333n); // 0.333333
        });

        it("should handle division by one", async function () {
            const a = { value: 5000000n }; // 5.0
            const b = { value: 1000000n }; // 1.0
            const result = await mock.testDiv(a, b);
            expect(result.value).to.equal(5000000n); // 5.0
        });
    });

    describe("divScalar", function () {
        it("should divide decimal by scalar", async function () {
            const a = { value: 6000000n }; // 6.0
            const scalar = 2;
            const result = await mock.testDivScalar(a, scalar);
            expect(result.value).to.equal(3000000n); // 3.0
        });

        it("should handle division by one", async function () {
            const a = { value: 5000000n }; // 5.0
            const scalar = 1;
            const result = await mock.testDivScalar(a, scalar);
            expect(result.value).to.equal(5000000n); // 5.0
        });
    });

    describe("add", function () {
        it("should add two decimals", async function () {
            const a = { value: 2000000n }; // 2.0
            const b = { value: 3000000n }; // 3.0
            const result = await mock.testAdd(a, b);
            expect(result.value).to.equal(5000000n); // 5.0
        });

        it("should handle addition with zero", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 0 }; // 0.0
            const result = await mock.testAdd(a, b);
            expect(result.value).to.equal(1000000n); // 1.0
        });
    });

    describe("sub", function () {
        it("should subtract two decimals", async function () {
            const a = { value: 5000000n }; // 5.0
            const b = { value: 2000000n }; // 2.0
            const result = await mock.testSub(a, b);
            expect(result.value).to.equal(3000000n); // 3.0
        });

        it("should handle subtraction with zero", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 0 }; // 0.0
            const result = await mock.testSub(a, b);
            expect(result.value).to.equal(1000000n); // 1.0
        });

        it("should handle subtraction resulting in zero", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 1000000n }; // 1.0
            const result = await mock.testSub(a, b);
            expect(result.value).to.equal(0);
        });
    });

    describe("fromRatio", function () {
        it("should convert ratio to decimal", async function () {
            const num = 3;
            const denom = 2;
            const result = await mock.testFromRatio(num, denom);
            expect(result.value).to.equal(1500000n); // 1.5
        });

        it("should handle ratio equal to one", async function () {
            const num = 5;
            const denom = 5;
            const result = await mock.testFromRatio(num, denom);
            expect(result.value).to.equal(1000000n); // 1.0
        });

        it("should handle ratio less than one", async function () {
            const num = 1;
            const denom = 3;
            const result = await mock.testFromRatio(num, denom);
            expect(result.value).to.equal(333333n); // 0.333333
        });
    });

    describe("gt", function () {
        it("should return true when first is greater", async function () {
            const a = { value: 3000000n }; // 3.0
            const b = { value: 2000000n }; // 2.0
            const result = await mock.testGt(a, b);
            expect(result).to.be.true;
        });

        it("should return false when first is less", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 2000000n }; // 2.0
            const result = await mock.testGt(a, b);
            expect(result).to.be.false;
        });

        it("should return false when equal", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 1000000n }; // 1.0
            const result = await mock.testGt(a, b);
            expect(result).to.be.false;
        });
    });

    describe("lt", function () {
        it("should return true when first is less", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 2000000n }; // 2.0
            const result = await mock.testLt(a, b);
            expect(result).to.be.true;
        });

        it("should return false when first is greater", async function () {
            const a = { value: 3000000n }; // 3.0
            const b = { value: 2000000n }; // 2.0
            const result = await mock.testLt(a, b);
            expect(result).to.be.false;
        });

        it("should return false when equal", async function () {
            const a = { value: 1000000n }; // 1.0
            const b = { value: 1000000n }; // 1.0
            const result = await mock.testLt(a, b);
            expect(result).to.be.false;
        });
    });
}); 