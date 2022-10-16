import * as fs from "fs";
import { ethers } from "ethers";
import { newProvider } from "../relayer/evm";
import { getScopedLogger } from "./logHelper";
import { ChainId, hexToUint8Array } from "@certusone/wormhole-sdk";

const logger = getScopedLogger(["serdeHelper"]);

export function leftPaddingAddress(addr: string): string {
  let normalAddr = addr.replace("0x", "");
  if (normalAddr.length < 64) {
    normalAddr = "0".repeat(64 - normalAddr.length) + normalAddr;
  }
  if (!normalAddr.startsWith("0x")) {
    normalAddr = "0x" + normalAddr;
  }
  return normalAddr;
}

export function readAbi(f: string) {
  if (fs.existsSync(f)) //判断是否存在此文件
  {
    //读取文件内容，并转化为Json对象
    let data = JSON.parse(fs.readFileSync(f, "utf8"));
    //获取Json里key为data的数据
    return data["abi"];
  } else {
    logger.error(f + " not found!");
    return null;
  }
}

// Init wormhole and token bridge contract to serde in bsc
const bscMainProvider = newProvider("https://bsc-dataseed1.defibit.io");
const wormholeAbiFile = "src/abis/Wormhole.json";
const wormholeAbi = readAbi(wormholeAbiFile);
export const wormhole = new ethers.Contract("0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B", wormholeAbi, bscMainProvider);
const tokenBridgeAbiFile = "src/abis/TokenBridge.json";
const tokenBridgeAbi = readAbi(tokenBridgeAbiFile);
export const tokenBridge = new ethers.Contract("0xB6F6D86a8f9879A9c87f643768d9efc38c1Da6E7", tokenBridgeAbi, bscMainProvider);

export type VAA = {
  version: number;
  timestamp: number;
  nonce: number;
  emitterChainId: ChainId;
  emitterAddress: string;
  sequence: string;
  consistencyLevel: number;
  payload: string;

  guardianSetIndex: number;
  signatures: any;

  hash: string;
}

export type Transfer = {
  // PayloadID uint8 = 1
  payloadID: number;
  // Amount being transferred (big-endian uint256)
  amount: BigInt;
  // Address of the token. Left-zero-padded if shorter than 32 bytes
  tokenAddress: string;
  // Chain ID of the token
  tokenChain: ChainId;
  // Address of the recipient. Left-zero-padded if shorter than 32 bytes
  to: string;
  // Chain ID of the recipient
  toChain: ChainId;
  // Amount of tokens (big-endian uint256) that the user is willing to pay as relayer fee. Must be <= Amount.
  fee: BigInt;
};

export type TransferWithPayload = {
  // PayloadID uint8 = 3
  payloadID: number;
  // Amount being transferred (big-endian uint256)
  amount: BigInt;

  // Address of the token. Left-zero-padded if shorter than 32 bytes
  tokenAddress: string;
  // Chain ID of the token
  tokenChain: ChainId;
  // Address of the recipient. Left-zero-padded if shorter than 32 bytes
  to: string;
  // Chain ID of the recipient
  toChain: ChainId;
  // Address of the message sender. Left-zero-padded if shorter than 32 bytes
  fromAddress: string;
  // An arbitrary payload
  payload: string;
};

export async function parseVAA(rawVaa: Uint8Array): Promise<VAA> {
  let result = await wormhole.parseVM(rawVaa);
  return {
    version: result[0],
    timestamp: result[1],
    nonce: result[2],
    emitterChainId: result[3],
    emitterAddress: result[4],
    sequence: result[5].toString(),
    consistencyLevel: result[6],
    payload: result[7],
    guardianSetIndex: result[8],
    signatures: result[9],
    hash: result[10]
  };
}

export async function parseTransferWithPayload(vaaPayload: Uint8Array): Promise<TransferWithPayload> {
  let result = await tokenBridge.parseTransferWithPayload(vaaPayload);
  return {
    payloadID: result[0],
    amount: result[1],
    tokenAddress: result[2],
    tokenChain: result[3],
    to: result[4],
    toChain: result[5],
    fromAddress: result[6],
    payload: result[7]
  };
}

export async function parseTransfer(vaaPayload: Uint8Array): Promise<Transfer> {
  let result = await tokenBridge.parseTransfer(vaaPayload);
  return {
    payloadID: result[0],
    amount: result[1],
    tokenAddress: result[2],
    tokenChain: result[3],
    to: result[4],
    toChain: result[5],
    fee: result[6]
  };
}

const bscTestProvider = newProvider("https://bsctestapi.terminet.io/rpc");
const wormholeFacetAbiFile = "src/abis/WormholeFacet.json";
const wormholeFacetAbi = readAbi(wormholeFacetAbiFile);
export const wormholeFacet = new ethers.Contract("0xB658abEd5457103f71B065A76A9Ed3C1fD88c591", wormholeFacetAbi, bscTestProvider);
const serdeFacetAbiFile = "src/abis/SerdeFacet.json";
const serdeFacetAbi = readAbi(serdeFacetAbiFile);
export const serdeFacet = new ethers.Contract("0xFFC1BC8A516C6B0EF5D3a5652a70e722Acf8f9C9", serdeFacetAbi, bscTestProvider);

export type NormalizedSoData = {
  transactionId: string;
  receiver: string;
  sourceChainId: number;
  sendingAssetId: string;
  destinationChainId: number;
  receivingAssetId: string;
  amount: BigInt;
};

export type NormalizedSwapData = {
  callTo: string;
  approveTo: string;
  sendingAssetId: string;
  receivingAssetId: string;
  fromAmount: BigInt;
  callData: string;
};

export type WormholePayload = {
  dstMaxGas: BigInt;
  dstMaxGasPrice: BigInt;
  soData: NormalizedSoData;
  dstSwapData: Array<NormalizedSwapData>
};

export async function parseWormholePayload(transferPayload: Uint8Array): Promise<WormholePayload> {
  let result = await wormholeFacet.decodeWormholePayload(transferPayload);
  const dstMaxGas = result[0];
  const dstMaxGasPrice = result[1];
  const soData: NormalizedSoData = {
    transactionId: result[2][0],
    receiver: result[2][1],
    sourceChainId: result[2][2],
    sendingAssetId: result[2][3],
    destinationChainId: result[2][4],
    receivingAssetId: result[2][5],
    amount: result[2][6]
  };
  let dstSwapData: Array<NormalizedSwapData> = [];
  for (let i = 0; i < result[3].length; i++) {
    dstSwapData.push(
      {
        callTo: result[3][i][0],
        approveTo: result[3][i][1],
        sendingAssetId: result[3][i][2],
        receivingAssetId: result[3][i][3],
        fromAmount: result[3][i][4],
        callData: result[3][i][5]
      }
    );
  }
  return {
    dstMaxGas,
    dstMaxGasPrice,
    soData,
    dstSwapData
  };
}

export async function parseVAAToWormholePayload(rawVaa: Uint8Array): Promise<{ vaa: VAA, transferPayload: TransferWithPayload, wormholePayload: WormholePayload }> {
  const vaa = await parseVAA(rawVaa);
  const transferPayload = await parseTransferWithPayload(hexToUint8Array(vaa.payload.replace("0x", "")));
  const wormholePayload = await parseWormholePayload(hexToUint8Array(transferPayload.payload.replace("0x", "")));
  return { vaa, transferPayload, wormholePayload };

}

