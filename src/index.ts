import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { interval, explorerURL, diffPercentage } from "./config";
import { flashloan } from "./flashloan";
import { checkIfProfitable, getBigNumber } from "./utils";
import { ethers } from "ethers";
import { flashloanTable, priceTable } from "./consoleUI/table";
import * as log4js from "log4js";
import { findOpp } from "./findOpp";
import { findTriangularArbitrageOpportunities } from "../src/triangularArbitrage";

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

  const func = async () => {
    try {
      const triangularArbitrageOpportunities =
        await findTriangularArbitrageOpportunities();

      for (const opportunity of triangularArbitrageOpportunities) {
        const { trade, expectedProfit } = opportunity;
        const baseToken = trade.path[0];
        const bnLoanAmount = trade.amountIn;
        const bnExpectedAmountOut = expectedProfit.add(bnLoanAmount);

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
      }
    } catch (e) {
      errReport.error(e);
    }
  };

  func();
  setInterval(func, interval);
};

main().catch((error) => {
  console.error(error);
  errReport.error(error);
  process.exit(1);
});
