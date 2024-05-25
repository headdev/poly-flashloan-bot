import { ethers } from "ethers";
import { IToken } from "../src/constants/addresses";
import { Hop, IFlashloanRoute } from "../src/interfaces/main";
import { ITrade } from "../src/interfaces/trade";
import { getUniswapV3PoolFee } from "../src/price/uniswap/v3/fee";
import { findRouterFromProtocol } from "../src//utils";
import { findTriangularArbitrageRoutes } from "./triangularArbitrage";

const getDataBytesForProtocol = (
  tokenIn: IToken,
  tokenOut: IToken,
  protocol: number
) => {
  switch (protocol) {
    // Uniswap V3
    case 0:
      return ethers.utils.defaultAbiCoder.encode(
        ["address", "uint24"],
        [
          findRouterFromProtocol(0),
          getUniswapV3PoolFee([tokenIn.address, tokenOut.address]),
        ]
      );
    // Uniswap V2
    default:
      return ethers.utils.defaultAbiCoder.encode(
        ["address"],
        [findRouterFromProtocol(protocol)]
      );
  }
};

export const passRoutes = (trade: ITrade): IFlashloanRoute[] => {
  const linearRoutes: IFlashloanRoute[] = [];
  let hops: Hop[] = [];
  trade.protocols.forEach((protocol, i) => {
    const tokenIn = trade.path[i];
    const tokenOut = trade.path[i + 1];
    const hop: Hop = {
      protocol: protocol,
      data: getDataBytesForProtocol(tokenIn, tokenOut, protocol),
      path: [tokenIn.address, tokenOut.address],
    };
    hops.push(hop);
  });
  linearRoutes.push({
    hops: hops,
    part: 10000,
  });

  const triangularArbitrageRoutes = findTriangularArbitrageRoutes(
    trade.path,
    []
  );

  return [...linearRoutes, ...triangularArbitrageRoutes];
};
