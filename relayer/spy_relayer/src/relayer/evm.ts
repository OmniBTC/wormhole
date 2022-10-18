import {
  Bridge__factory,
  CHAIN_ID_AVAX,
  CHAIN_ID_CELO,
  CHAIN_ID_FANTOM,
  CHAIN_ID_KLAYTN,
  CHAIN_ID_POLYGON,
  ChainId,
  getIsTransferCompletedEth,
  hexToUint8Array,
} from "@certusone/wormhole-sdk";
import { ethers } from "ethers";
import {
  ChainConfigInfo,
  getListenerEnvironment,
  getRelayerEnvironment,
} from "../configureEnv";
import { getScopedLogger, ScopedLogger } from "../helpers/logHelper";
import { PromHelper } from "../helpers/promHelpers";
import { CeloProvider, CeloWallet } from "@celo-tools/celo-ethers-wrapper";
import {
  leftPaddingAddress,
  parseVAAToWormholePayload,
  WormholePayload,
} from "../helpers/serdeHelper";
import { addDstGasInMongo } from "../helpers/mongoHelper";

function getChainConfigInfo(chainId: ChainId) {
  const env = getRelayerEnvironment();
  return env.supportedChains.find((x) => x.chainId === chainId);
}

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

export async function processTransfer(
  dstChainId: ChainId,
  signedVAA: string,
  unwrapNative: boolean,
  checkOnly: boolean,
  walletPrivateKey: string
) {
  const chainConfigInfo = getChainConfigInfo(dstChainId);
  if (!chainConfigInfo) {
    return;
  }
  const logger = getScopedLogger(["evm", chainConfigInfo.chainName]);

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

  let diamondAddress = "";
  getListenerEnvironment().diamondAddress.forEach((d) => {
    if (d.chainId == chainConfigInfo.chainId) {
      diamondAddress = d.address;
    }
  });
  if (diamondAddress == "") {
    logger.error(
      "Not found diamond address for chainid: ",
      chainConfigInfo.chainId
    );
  }

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

  if (chainConfigInfo.chainId === CHAIN_ID_POLYGON) {
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

  let estimateMaxGas = undefined;
  let estimateGasPrice = undefined;
  let dstSwapLength = 0;
  try {
    const { transferPayload, wormholePayload } =
      await parseVAAToWormholePayload(signedVaaArray);
    estimateMaxGas = wormholePayload.dstMaxGas;
    estimateGasPrice = wormholePayload.dstMaxGasPrice;
    dstSwapLength = wormholePayload.dstSwapData.length;
    logger.info(
      "In wormholePayload estimateMaxGas: " +
        estimateMaxGas +
        " estimateMaxGasPrice: " +
        estimateGasPrice +
        " dstSwapLength: " +
        dstSwapLength
    );
    // if (wormholePayload.dstMaxGasPrice.toString() != "0") {
    //   overrides = { gasPrice: wormholePayload.dstMaxGasPrice.toString() };
    // }
    const p1 = leftPaddingAddress(diamondAddress.toLowerCase());
    const p2 = leftPaddingAddress(transferPayload.to);
    if (transferPayload.toChain != dstChainId) {
      logger.error(
        "toChain: " +
          transferPayload.toChain +
          " not match dstChainId: " +
          dstChainId
      );
    }
    if (diamondAddress != "" && p1 != p2) {
      logger.error("DiamondAddress: " + p1 + " not match to: " + p2);
    }
  } catch (e) {
    logger.info("Not omniswap payload!");
  }

  // call wormhole faucet function
  const bridge = Bridge__factory.connect(diamondAddress, signer);
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

  await addDstGasInMongo({
    chainId: chainConfigInfo.chainId,
    vaaLength: signedVaaArray.length,
    dstSwapLength: dstSwapLength,
    estimateGas: estimateMaxGas !== undefined ? estimateMaxGas : BigInt(0),
    estimateGasPrice:
      estimateGasPrice !== undefined ? estimateGasPrice : BigInt(0),
    actualGas: receipt.gasUsed,
    actualGasPrice: receipt.effectiveGasPrice,
  });

  logger.info(
    "tx gas used: %d, tx cumulativeGasUsed: %d, tx effective gas price: %d",
    receipt.gasUsed,
    receipt.cumulativeGasUsed,
    receipt.effectiveGasPrice
  );
  if (provider instanceof ethers.providers.WebSocketProvider) {
    await provider.destroy();
  }

  logger.info("success: %s tx hash: %s", success, receipt.transactionHash);
  return { redeemed: success, result: receipt };
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
  const result = await processTransfer(
    chainConfigInfo.chainId,
    signedVAA,
    unwrapNative,
    checkOnly,
    walletPrivateKey
  );

  metrics.incSuccesses(chainConfigInfo.chainId);
  return result;
}
