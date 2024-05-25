import { IFlashloanRoute, Hop } from "./interfaces/main";
import { getUniswapV3PoolFee } from "./price/uniswap/v3/fee";
import { findRouterFromProtocol } from "./utils";
import { IToken } from "../src/constants/addresses";
import { ethers } from "ethers";

interface Edge {
  from: IToken;
  to: IToken;
  weight: number;
}

class Graph {
  vertices: IToken[];
  edges: Edge[];

  constructor(vertices: IToken[], edges: Edge[]) {
    this.vertices = vertices;
    this.edges = edges;
  }
}

const createGraphFromTokens = (
  tokens: IToken[],
  pairs: [IToken, IToken, number][]
): Graph => {
  const edges: Edge[] = pairs.map(([from, to, weight]) => ({
    from,
    to,
    weight,
  }));

  return new Graph(tokens, edges);
};

const bellmanFordDFS = (
  graph: Graph,
  source: IToken,
  maxDepth: number
): IFlashloanRoute[] => {
  const visited: { [tokenAddress: string]: boolean } = {};
  const routes: IFlashloanRoute[] = [];

  const dfs = (
    token: IToken,
    path: IToken[],
    weight: number,
    depth: number
  ) => {
    if (depth > maxDepth) {
      return;
    }

    visited[token.address] = true;
    path.push(token);

    if (token === source && depth > 0) {
      const route: IFlashloanRoute = {
        hops: path.slice(1).map((fromToken, i) => ({
          protocol: 0, // Asume Uniswap V3 por defecto
          data: getDataBytesForProtocol(fromToken, path[i], 0),
          path: [fromToken.address, path[i].address],
        })),
        part: 10000,
      };
      routes.push(route);
    }

    for (const edge of graph.edges) {
      if (edge.from === token && !visited[edge.to.address]) {
        dfs(edge.to, path, weight + edge.weight, depth + 1);
      }
    }

    path.pop();
    visited[token.address] = false;
  };

  dfs(source, [], 0, 0);

  return routes;
};

export const findTriangularArbitrageRoutes = (
  tokens: IToken[],
  pairs: [IToken, IToken, number][]
): IFlashloanRoute[] => {
  const graph = createGraphFromTokens(tokens, pairs);
  const arbitrageRoutes: IFlashloanRoute[] = [];

  for (const token of tokens) {
    const routes = bellmanFordDFS(graph, token, 3);
    arbitrageRoutes.push(...routes);
  }

  return arbitrageRoutes;
};

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
