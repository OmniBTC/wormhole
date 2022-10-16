import axios from "axios";
import { findVaaInMongo, VAAStorage } from "../helpers/mongoHelper";
import { leftPaddingAddress } from "../helpers/serdeHelper";
import { emitChainIdToAddress } from "../backends/default/listener";
import { getScopedLogger } from "../helpers/logHelper";


export async function getUnProcessSwap(): Promise<VAAStorage[]> {
  const logger = getScopedLogger(["getUnProcessSwap"]);
  const result = await axios.get("https://crossswap-pre.coming.chat/v1/getUnSendTransferFromWormhole");
  let output: VAAStorage[] = [];
  try {
    for (let i = 0; i < result.data.record.length; i++) {
      try {
        const srcWormholeChainId = result.data.record[i].srcWormholeChainId;
        const sequence = result.data.record[i].dstWormholeChainId;
        const emitterAddress = emitChainIdToAddress[srcWormholeChainId];
        if (!emitterAddress) {
          continue;
        }
        const item = await findVaaInMongo(srcWormholeChainId, leftPaddingAddress(emitterAddress), sequence.toString());
        if (item != null) {
          const now = new Date().getTime();
          if (now - item.timestamp >= 10 * 60) {
            output.push(item);
          }
        }
      } catch (e) {
        logger.error("getUnProcessSwap process fail: ", e);
      }
    }
  } catch (e) {
    logger.error("getUnProcessSwap format error: ", e);
  }
  if (output.length > 0) {
    logger.info("Start compensate item length: ", output.length);
  }
  return output;
}

