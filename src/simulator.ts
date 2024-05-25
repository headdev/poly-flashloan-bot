import { BigNumber, ethers } from "ethers";
import { getPriceOnUniV2 } from "./price/uniswap/v2/getPrice";
import { getPriceOnUniV3 } from "./price/uniswap/v3/getPrice";
import * as fs from "fs";

const provider = new ethers.providers.JsonRpcProvider(
  "https://polygon-rpc.com"
);

interface ArbitrageOpportunity {
  path: string[];
  protocols: number[];
  expectedProfit: BigNumber;
}

export const findRouterFromProtocol = (protocol: number): string => {
  switch (protocol) {
    case 0:
      return "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"; // Dirección del enrutador de Uniswap V3 en Polygon
    case 1:
      return "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"; // Dirección del enrutador de SushiSwap (Uniswap V2) en Polygon
    default:
      throw new Error("Invalid protocol");
  }
};

export const getBigNumber = (value: number): BigNumber => {
  return ethers.BigNumber.from(value);
};

export const expectPriceOnDex = async (
  protocol: number,
  amountIn: BigNumber,
  tokenIn: string,
  tokenOut: string
): Promise<BigNumber> => {
  if (!amountIn || amountIn.eq(getBigNumber(0))) {
    return getBigNumber(0);
  }
  if (protocol === 0) {
    return await getPriceOnUniV3(tokenIn, tokenOut, amountIn);
  } else {
    const routerAddress = findRouterFromProtocol(protocol);
    return await getPriceOnUniV2(tokenIn, tokenOut, amountIn, routerAddress);
  }
};

export const findTriangularArbitrage = async (
  tokens: string[],
  protocols: number[],
  amountIn: BigNumber,
  minProfitThreshold: BigNumber
): Promise<ArbitrageOpportunity[]> => {
  const opportunities: ArbitrageOpportunity[] = [];

  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < tokens.length; j++) {
      if (i !== j) {
        for (let k = 0; k < tokens.length; k++) {
          if (k !== i && k !== j) {
            const tokenA = tokens[i];
            const tokenB = tokens[j];
            const tokenC = tokens[k];

            for (const protocol1 of protocols) {
              for (const protocol2 of protocols) {
                for (const protocol3 of protocols) {
                  const amountOutAB = await expectPriceOnDex(
                    protocol1,
                    amountIn,
                    tokenA,
                    tokenB
                  );
                  const amountOutBC = await expectPriceOnDex(
                    protocol2,
                    amountOutAB,
                    tokenB,
                    tokenC
                  );
                  const amountOutCA = await expectPriceOnDex(
                    protocol3,
                    amountOutBC,
                    tokenC,
                    tokenA
                  );

                  const expectedProfit = amountOutCA.sub(amountIn);
                  if (expectedProfit.gt(minProfitThreshold)) {
                    opportunities.push({
                      path: [tokenA, tokenB, tokenC],
                      protocols: [protocol1, protocol2, protocol3],
                      expectedProfit,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return opportunities;
};

export const saveArbitragesToJson = (opportunities: ArbitrageOpportunity[]) => {
  const data = JSON.stringify(opportunities, null, 2);
  fs.writeFileSync("arbitrages.json", data);
};

// Ejemplo de uso
const tokens = [
  "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH en Polygon
  "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC en Polygon
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC en Polygon
];
const protocols = [0, 1]; // 0: Uniswap V3, 1: SushiSwap (Uniswap V2)
const amountIn = ethers.utils.parseEther("1"); // 1 WETH
const minProfitThreshold = ethers.utils.parseEther("0.01"); // 0.01 WETH

findTriangularArbitrage(tokens, protocols, amountIn, minProfitThreshold)
  .then((opportunities) => {
    console.log("Arbitrage Opportunities:", opportunities);
    saveArbitragesToJson(opportunities);
  })
  .catch((error) => {
    console.error("Error finding arbitrage opportunities:", error);
  });
