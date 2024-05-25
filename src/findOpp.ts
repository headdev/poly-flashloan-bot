import { ITrade } from "./interfaces/trade";
import { getPriceOnUniV2 } from "./price/uniswap/v2/getPrice";
import { getPriceOnUniV3 } from "./price/uniswap/v3/getPrice";
import { findRouterFromProtocol, getBigNumber } from "./utils";
import * as log4js from "log4js";
import { findTriangularArbitrageRoutes } from "./triangularArbitrage";
import { IToken } from "../src/constants/addresses";
import { getUniswapV3PoolFee } from "./price/uniswap/v3/fee";

const errReport = log4js.getLogger("error");

export const findOpp = async (trade: ITrade) => {
  let amountOut = trade.amountIn;
  for (const [i, protocol] of trade.protocols.entries()) {
    switch (protocol) {
      // Uniswap V3
      case 0:
        try {
          amountOut = await getPriceOnUniV3(
            trade.path[i].address,
            trade.path[i + 1].address,
            amountOut
          );
          break;
        } catch (e) {
          logError(e);
          amountOut = getBigNumber(0);
          break;
        }
      // Uniswap V2
      default:
        try {
          amountOut = await getPriceOnUniV2(
            trade.path[i].address,
            trade.path[i + 1].address,
            amountOut,
            findRouterFromProtocol(protocol)
          );
          break;
        } catch (e) {
          logError(e);
          amountOut = getBigNumber(0);
          break;
        }
    }
  }

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
            logError(e);
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
            logError(e);
            amountOut = getBigNumber(0);
            break;
          }
      }
    }

    if (amountOut.gt(trade.amountIn)) {
      return amountOut;
    }
  }

  return amountOut;
};

const logError = (e: any) => {
  errReport.warn("Failed to estimate price: ", e?.reason);
};
