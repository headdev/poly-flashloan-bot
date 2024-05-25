import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { interval, explorerURL, diffPercentage, tradingRoutes } from "./config";
import { flashloan } from "./flashloan";
import {
  checkIfProfitable,
  getBigNumber,
  findRouterFromProtocol,
} from "./utils";
import { ethers } from "ethers";
import { flashloanTable, priceTable } from "./consoleUI/table";
import * as log4js from "log4js";
import { findOpp } from "./findOpp";
import { findTriangularArbitrageRoutes } from "./triangularArbitrage";
import { IToken } from "./constants/addresses";
import { getUniswapV3PoolFee } from "./price/uniswap/v3/fee";
import { getPriceOnUniV2 } from "./price/uniswap/v2/getPrice";
import { getPriceOnUniV3 } from "./price/uniswap/v3/getPrice";

log4js.configure({
  appenders: {
    flashloan: { type: "file", filename: "log/flashloan.log" },
    error: { type: "file", filename: "log/error.log" },
  },
  categories: {
    default: { appenders: ["flashloan"], level: "info" },
    error: { appenders: ["error"], level: "warn" },
  },
});

const logger = log4js.getLogger("flashloan");
const errReport = log4js.getLogger("error");

export const main = async () => {
  let isFlashLoaning = false;

  tradingRoutes.forEach(async (trade) => {
    const baseToken = trade.path[0];

    const func = async () => {
      const bnLoanAmount = trade.amountIn;
      let bnExpectedAmountOut = await findOpp(trade);

      const triangularArbitrageRoutes = findTriangularArbitrageRoutes(
        trade.path,
        []
      );

      for (const route of triangularArbitrageRoutes) {
        let amountOut = trade.amountIn;
        for (const hop of route.hops) {
          const tokenIn = hop.path[0];
          const tokenOut = hop.path[1];
          const exchange = hop.protocol;

          switch (exchange) {
            // Uniswap V3
            case 0:
              try {
                const fee = getUniswapV3PoolFee([tokenIn, tokenOut]);
                amountOut = await getPriceOnUniV3(tokenIn, tokenOut, amountOut);
                break;
              } catch (e) {
                errReport.warn(e);
                amountOut = getBigNumber(0);
                break;
              }
            // Uniswap V2
            default:
              try {
                amountOut = await getPriceOnUniV2(
                  tokenIn,
                  tokenOut,
                  amountOut,
                  findRouterFromProtocol(exchange)
                );
                break;
              } catch (e) {
                errReport.warn(e);
                amountOut = getBigNumber(0);
                break;
              }
          }
        }

        if (amountOut.gt(bnExpectedAmountOut)) {
          bnExpectedAmountOut = amountOut;
        }
      }

      const isProfitable = checkIfProfitable(
        bnLoanAmount,
        diffPercentage,
        bnExpectedAmountOut
      );

      console.log("isProfitable", isProfitable);

      if (isProfitable && !isFlashLoaning) {
        isFlashLoaning = true;

        try {
          const tx = await flashloan(trade);
          const stDifference = Number(
            ethers.utils.formatUnits(
              bnExpectedAmountOut.sub(bnLoanAmount),
              baseToken.decimals
            )
          ).toFixed(4);
          const amount = Number(
            ethers.utils.formatUnits(bnExpectedAmountOut, baseToken.decimals)
          ).toFixed(4);
          const loanAmount = Number(
            ethers.utils.formatUnits(bnLoanAmount, baseToken.decimals)
          );
          const difference = Number(stDifference);
          const percentage = Number(
            ((difference / loanAmount) * 100).toFixed(2)
          );
          const path = trade.path.map((token) => {
            return token.symbol;
          });

          logger.info("path", path, "protocols", trade.protocols);
          logger.info({ amount, difference, percentage });
          logger.info(`Explorer URL: ${explorerURL}/tx/${tx.hash}`);
        } catch (e) {
          errReport.error(e);
        } finally {
          isFlashLoaning = false;
        }
      }
    };

    func();
    setInterval(func, interval);
  });
};

main().catch((error) => {
  console.error(error);
  errReport.error(error);
  process.exit(1);
});
