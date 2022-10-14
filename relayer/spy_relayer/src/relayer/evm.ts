import {
  Bridge__factory,
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
  CHAIN_ID_CELO,
  CHAIN_ID_FANTOM,
  CHAIN_ID_KLAYTN,
  CHAIN_ID_POLYGON,
  getIsTransferCompletedEth,
  hexToUint8Array,
  redeemOnEth,
  redeemOnEthNative,
} from "@certusone/wormhole-sdk";
import { ethers } from "ethers";
import { ChainConfigInfo } from "../configureEnv";
import { getScopedLogger, ScopedLogger } from "../helpers/logHelper";
import { PromHelper } from "../helpers/promHelpers";
import { CeloProvider, CeloWallet } from "@celo-tools/celo-ethers-wrapper";

export function newProvider(
  url: string,
  batch: boolean = false
): ethers.providers.JsonRpcProvider | ethers.providers.JsonRpcBatchProvider {
  // only support http(s), not ws(s) as the websocket constructor can blow up the entire process
  // it uses a nasty setTimeout(()=>{},0) so we are unable to cleanly catch its errors
  if (url.startsWith("http")) {
    if (batch) {
      return new ethers.providers.JsonRpcBatchProvider(url);
    }
    return new ethers.providers.JsonRpcProvider(url);
  }
  throw new Error("url does not start with http/https!");
}

export async function relayEVM(
  chainConfigInfo: ChainConfigInfo,
  signedVAA: string,
  unwrapNative: boolean,
  checkOnly: boolean,
  walletPrivateKey: string,
  relayLogger: ScopedLogger,
  metrics: PromHelper
) {
  const logger = getScopedLogger(
    ["evm", chainConfigInfo.chainName],
    relayLogger
  );
  const signedVaaArray = hexToUint8Array(signedVAA);
  let provider = undefined;
  let signer = undefined;
  if (chainConfigInfo.chainId === CHAIN_ID_CELO) {
    provider = new CeloProvider(chainConfigInfo.nodeUrl);
    await provider.ready;
    signer = new CeloWallet(walletPrivateKey, provider);
  } else {
    provider = newProvider(chainConfigInfo.nodeUrl);
    signer = new ethers.Wallet(walletPrivateKey, provider);
  }

  const abi = [
    {
      inputs: [],
      name: "ContractCallNotAllowed",
      type: "error",
    },
    {
      inputs: [],
      name: "InvalidAmount",
      type: "error",
    },
    {
      inputs: [],
      name: "InvalidContract",
      type: "error",
    },
    {
      inputs: [],
      name: "NativeAssetTransferFailed",
      type: "error",
    },
    {
      inputs: [],
      name: "NoSwapDataProvided",
      type: "error",
    },
    {
      inputs: [],
      name: "NoSwapFromZeroBalance",
      type: "error",
    },
    {
      inputs: [],
      name: "NoTransferToNullAddress",
      type: "error",
    },
    {
      inputs: [],
      name: "NotSupportedSwapRouter",
      type: "error",
    },
    {
      inputs: [],
      name: "NullAddrIsNotAValidSpender",
      type: "error",
    },
    {
      inputs: [],
      name: "NullAddrIsNotAnERC20Token",
      type: "error",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: "address",
          name: "tokenBridge",
          type: "address",
        },
        {
          indexed: false,
          internalType: "uint16",
          name: "srcWormholeChainId",
          type: "uint16",
        },
      ],
      name: "InitWormholeEvent",
      type: "event",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: "bytes32",
          name: "transactionId",
          type: "bytes32",
        },
        {
          indexed: false,
          internalType: "address",
          name: "receivingAssetId",
          type: "address",
        },
        {
          indexed: false,
          internalType: "address",
          name: "receiver",
          type: "address",
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "receiveAmount",
          type: "uint256",
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "timestamp",
          type: "uint256",
        },
        {
          components: [
            {
              internalType: "bytes32",
              name: "transactionId",
              type: "bytes32",
            },
            {
              internalType: "address payable",
              name: "receiver",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "sourceChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "destinationChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "amount",
              type: "uint256",
            },
          ],
          indexed: false,
          internalType: "struct ISo.SoData",
          name: "soData",
          type: "tuple",
        },
      ],
      name: "SoTransferCompleted",
      type: "event",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: "bytes32",
          name: "transactionId",
          type: "bytes32",
        },
        {
          indexed: false,
          internalType: "string",
          name: "revertReason",
          type: "string",
        },
        {
          indexed: false,
          internalType: "bytes",
          name: "otherReason",
          type: "bytes",
        },
        {
          components: [
            {
              internalType: "bytes32",
              name: "transactionId",
              type: "bytes32",
            },
            {
              internalType: "address payable",
              name: "receiver",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "sourceChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "destinationChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "amount",
              type: "uint256",
            },
          ],
          indexed: false,
          internalType: "struct ISo.SoData",
          name: "soData",
          type: "tuple",
        },
      ],
      name: "SoTransferFailed",
      type: "event",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: "bytes32",
          name: "transactionId",
          type: "bytes32",
        },
        {
          indexed: false,
          internalType: "string",
          name: "bridge",
          type: "string",
        },
        {
          indexed: false,
          internalType: "bool",
          name: "hasSourceSwap",
          type: "bool",
        },
        {
          indexed: false,
          internalType: "bool",
          name: "hasDestinationSwap",
          type: "bool",
        },
        {
          components: [
            {
              internalType: "bytes32",
              name: "transactionId",
              type: "bytes32",
            },
            {
              internalType: "address payable",
              name: "receiver",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "sourceChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "destinationChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "amount",
              type: "uint256",
            },
          ],
          indexed: false,
          internalType: "struct ISo.SoData",
          name: "soData",
          type: "tuple",
        },
      ],
      name: "SoTransferStarted",
      type: "event",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: "uint16",
          name: "dstWormholeChainId",
          type: "uint16",
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "baseGas",
          type: "uint256",
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "gasPerBytes",
          type: "uint256",
        },
      ],
      name: "UpdateWormholeGas",
      type: "event",
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: "uint256",
          name: "actualReserve",
          type: "uint256",
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "estimateReserve",
          type: "uint256",
        },
      ],
      name: "UpdateWormholeReserve",
      type: "event",
    },
    {
      inputs: [],
      name: "RAY",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: "bytes32",
              name: "transactionId",
              type: "bytes32",
            },
            {
              internalType: "address payable",
              name: "receiver",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "sourceChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "destinationChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "amount",
              type: "uint256",
            },
          ],
          internalType: "struct ISo.SoData",
          name: "_soData",
          type: "tuple",
        },
        {
          components: [
            {
              internalType: "uint16",
              name: "dstWormholeChainId",
              type: "uint16",
            },
            {
              internalType: "uint256",
              name: "dstMaxGasForRelayer",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "dstMaxGasPriceInWeiForRelayer",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "dstSoDiamond",
              type: "address",
            },
          ],
          internalType: "struct WormholeFacet.WormholeData",
          name: "_wormholeData",
          type: "tuple",
        },
        {
          internalType: "uint256",
          name: "_value",
          type: "uint256",
        },
      ],
      name: "checkRelayerFee",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool",
        },
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "bytes",
          name: "_encodeVm",
          type: "bytes",
        },
      ],
      name: "completeSoSwap",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "bytes",
          name: "_encodeVm",
          type: "bytes",
        },
      ],
      name: "completeTransferAndUnwrapETHWithPayload",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "bytes",
          name: "_encodeVm",
          type: "bytes",
        },
      ],
      name: "completeTransferWithPayload",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "_currentAssetId",
          type: "address",
        },
        {
          internalType: "address",
          name: "_expectAssetId",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "_amount",
          type: "uint256",
        },
      ],
      name: "deposit",
      outputs: [],
      stateMutability: "payable",
      type: "function",
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: "bytes32",
              name: "transactionId",
              type: "bytes32",
            },
            {
              internalType: "address payable",
              name: "receiver",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "sourceChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "destinationChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "amount",
              type: "uint256",
            },
          ],
          internalType: "struct ISo.SoData",
          name: "_soData",
          type: "tuple",
        },
      ],
      name: "encodeSoData",
      outputs: [
        {
          internalType: "bytes",
          name: "_encoded",
          type: "bytes",
        },
      ],
      stateMutability: "pure",
      type: "function",
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: "address",
              name: "callTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "approveTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "fromAmount",
              type: "uint256",
            },
            {
              internalType: "bytes",
              name: "callData",
              type: "bytes",
            },
          ],
          internalType: "struct LibSwap.SwapData[]",
          name: "_swapData",
          type: "tuple[]",
        },
      ],
      name: "encodeSwapData",
      outputs: [
        {
          internalType: "bytes",
          name: "_encoded",
          type: "bytes",
        },
      ],
      stateMutability: "pure",
      type: "function",
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: "bytes32",
              name: "transactionId",
              type: "bytes32",
            },
            {
              internalType: "address payable",
              name: "receiver",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "sourceChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "destinationChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "amount",
              type: "uint256",
            },
          ],
          internalType: "struct ISo.SoData",
          name: "_soData",
          type: "tuple",
        },
        {
          components: [
            {
              internalType: "uint16",
              name: "dstWormholeChainId",
              type: "uint16",
            },
            {
              internalType: "uint256",
              name: "dstMaxGasForRelayer",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "dstMaxGasPriceInWeiForRelayer",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "dstSoDiamond",
              type: "address",
            },
          ],
          internalType: "struct WormholeFacet.WormholeData",
          name: "_wormholeData",
          type: "tuple",
        },
        {
          components: [
            {
              internalType: "address",
              name: "callTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "approveTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "fromAmount",
              type: "uint256",
            },
            {
              internalType: "bytes",
              name: "callData",
              type: "bytes",
            },
          ],
          internalType: "struct LibSwap.SwapData[]",
          name: "_swapDataDst",
          type: "tuple[]",
        },
      ],
      name: "estimateCompleteSoSwapGas",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: "uint16",
              name: "dstWormholeChainId",
              type: "uint16",
            },
            {
              internalType: "uint256",
              name: "dstMaxGasForRelayer",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "dstMaxGasPriceInWeiForRelayer",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "dstSoDiamond",
              type: "address",
            },
          ],
          internalType: "struct WormholeFacet.WormholeData",
          name: "_wormholeData",
          type: "tuple",
        },
      ],
      name: "estimateRelayerFee",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: "bytes32",
              name: "transactionId",
              type: "bytes32",
            },
            {
              internalType: "address payable",
              name: "receiver",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "sourceChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "destinationChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "amount",
              type: "uint256",
            },
          ],
          internalType: "struct ISo.SoData",
          name: "_soData",
          type: "tuple",
        },
        {
          components: [
            {
              internalType: "address",
              name: "callTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "approveTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "fromAmount",
              type: "uint256",
            },
            {
              internalType: "bytes",
              name: "callData",
              type: "bytes",
            },
          ],
          internalType: "struct LibSwap.SwapData[]",
          name: "_swapData",
          type: "tuple[]",
        },
      ],
      name: "executeAndCheckSwaps",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "bytes",
          name: "_encodeVm",
          type: "bytes",
        },
      ],
      name: "getMaxGasAndPrice",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "_amount",
          type: "uint256",
        },
      ],
      name: "getSoFee",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256",
        },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "_tokenBridge",
          type: "address",
        },
        {
          internalType: "uint16",
          name: "_wormholeChainId",
          type: "uint16",
        },
      ],
      name: "initWormhole",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "bytes",
          name: "_encodedPayload",
          type: "bytes",
        },
      ],
      name: "parseMaxGasPrice",
      outputs: [
        {
          internalType: "uint256",
          name: "maxGasPrice",
          type: "uint256",
        },
      ],
      stateMutability: "pure",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "bytes",
          name: "_encodedPayload",
          type: "bytes",
        },
      ],
      name: "parseSoData",
      outputs: [
        {
          components: [
            {
              internalType: "bytes32",
              name: "transactionId",
              type: "bytes32",
            },
            {
              internalType: "address payable",
              name: "receiver",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "sourceChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "destinationChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "amount",
              type: "uint256",
            },
          ],
          internalType: "struct ISo.SoData",
          name: "_soData",
          type: "tuple",
        },
      ],
      stateMutability: "pure",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "bytes",
          name: "_encodedPayload",
          type: "bytes",
        },
      ],
      name: "parseSwapData",
      outputs: [
        {
          components: [
            {
              internalType: "address",
              name: "callTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "approveTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "fromAmount",
              type: "uint256",
            },
            {
              internalType: "bytes",
              name: "callData",
              type: "bytes",
            },
          ],
          internalType: "struct LibSwap.SwapData[]",
          name: "_swapData",
          type: "tuple[]",
        },
      ],
      stateMutability: "pure",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint16",
          name: "_dstWormholeChainId",
          type: "uint16",
        },
        {
          internalType: "uint256",
          name: "_baseGas",
          type: "uint256",
        },
        {
          internalType: "uint256",
          name: "_gasPerBytes",
          type: "uint256",
        },
      ],
      name: "setWormholeGas",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "uint256",
          name: "_actualReserve",
          type: "uint256",
        },
        {
          internalType: "uint256",
          name: "_estimateReserve",
          type: "uint256",
        },
      ],
      name: "setWormholeReserve",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: "bytes32",
              name: "transactionId",
              type: "bytes32",
            },
            {
              internalType: "address payable",
              name: "receiver",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "sourceChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "destinationChainId",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "amount",
              type: "uint256",
            },
          ],
          internalType: "struct ISo.SoData",
          name: "_soData",
          type: "tuple",
        },
        {
          components: [
            {
              internalType: "address",
              name: "callTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "approveTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "fromAmount",
              type: "uint256",
            },
            {
              internalType: "bytes",
              name: "callData",
              type: "bytes",
            },
          ],
          internalType: "struct LibSwap.SwapData[]",
          name: "_swapDataSrc",
          type: "tuple[]",
        },
        {
          components: [
            {
              internalType: "uint16",
              name: "dstWormholeChainId",
              type: "uint16",
            },
            {
              internalType: "uint256",
              name: "dstMaxGasForRelayer",
              type: "uint256",
            },
            {
              internalType: "uint256",
              name: "dstMaxGasPriceInWeiForRelayer",
              type: "uint256",
            },
            {
              internalType: "address",
              name: "dstSoDiamond",
              type: "address",
            },
          ],
          internalType: "struct WormholeFacet.WormholeData",
          name: "_wormholeData",
          type: "tuple",
        },
        {
          components: [
            {
              internalType: "address",
              name: "callTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "approveTo",
              type: "address",
            },
            {
              internalType: "address",
              name: "sendingAssetId",
              type: "address",
            },
            {
              internalType: "address",
              name: "receivingAssetId",
              type: "address",
            },
            {
              internalType: "uint256",
              name: "fromAmount",
              type: "uint256",
            },
            {
              internalType: "bytes",
              name: "callData",
              type: "bytes",
            },
          ],
          internalType: "struct LibSwap.SwapData[]",
          name: "_swapDataDst",
          type: "tuple[]",
        },
      ],
      name: "soSwapViaWormhole",
      outputs: [],
      stateMutability: "payable",
      type: "function",
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "_currentAssetId",
          type: "address",
        },
        {
          internalType: "address",
          name: "_expectAssetId",
          type: "address",
        },
        {
          internalType: "uint256",
          name: "_amount",
          type: "uint256",
        },
        {
          internalType: "address",
          name: "_receiver",
          type: "address",
        },
      ],
      name: "withdraw",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];

  let diamond_address = "";
  if (chainConfigInfo.chainId === CHAIN_ID_AVAX) {
    diamond_address = "0xDEE3a4fA877658E7e5efD4A9332de1b673ABF75f";
  } else if (chainConfigInfo.chainId === CHAIN_ID_BSC) {
    diamond_address = "0x379838Ab3cab29F5BdA0FFD62547c90E8AeB6Ecc";
  }

  const diamond = new ethers.Contract(diamond_address, abi, provider);

  const result = await diamond.getMaxGasAndPrice(signedVaaArray);
  logger.info("Max gas and price: " + result);

  logger.debug("Checking to see if vaa has already been redeemed.");
  const alreadyRedeemed = await getIsTransferCompletedEth(
    chainConfigInfo.tokenBridgeAddress,
    provider,
    signedVaaArray
  );

  if (alreadyRedeemed) {
    logger.info("VAA has already been redeemed!");
    return { redeemed: true, result: "already redeemed" };
  }
  if (checkOnly) {
    return { redeemed: false, result: "not redeemed" };
  }

  if (unwrapNative) {
    logger.info(
      "Will redeem and unwrap using pubkey: %s",
      await signer.getAddress()
    );
  } else {
    logger.info("Will redeem using pubkey: %s", await signer.getAddress());
  }

  logger.debug("Redeeming.");
  let overrides = {};
  if (
    chainConfigInfo.chainId === CHAIN_ID_POLYGON ||
    chainConfigInfo.chainId === CHAIN_ID_AVAX
  ) {
    // look, there's something janky with Polygon + ethers + EIP-1559
    let feeData = await provider.getFeeData();
    overrides = {
      maxFeePerGas: feeData.maxFeePerGas?.mul(50) || undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.mul(50) || undefined,
    };
  } else if (
    chainConfigInfo.chainId === CHAIN_ID_KLAYTN ||
    chainConfigInfo.chainId === CHAIN_ID_FANTOM
  ) {
    // Klaytn and Fantom require specifying gasPrice
    overrides = { gasPrice: (await signer.getGasPrice()).toString() };
  }

  // call wormhole faucet function
  const bridge = Bridge__factory.connect(diamond_address, signer);
  const contractMethod = unwrapNative
    ? bridge.completeTransferAndUnwrapETHWithPayload
    : bridge.completeTransferWithPayload;
  const tx = await contractMethod(signedVaaArray, overrides);
  logger.info("tx gas: %d, and gas price: %d", tx.gasLimit, tx.gasPrice);
  logger.info("waiting for tx hash: %s", tx.hash);
  const receipt = await tx.wait();

  // Checking getIsTransferCompletedEth can be problematic if we get
  // load balanced to a node that is behind the block of our accepted tx
  // The auditor worker should confirm that our tx was successful
  const success = true;

  if (provider instanceof ethers.providers.WebSocketProvider) {
    await provider.destroy();
  }

  logger.info("success: %s tx hash: %s", success, receipt.transactionHash);
  metrics.incSuccesses(chainConfigInfo.chainId);
  return { redeemed: success, result: receipt };
}
