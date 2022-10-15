import axios from "axios";
import { getLogger } from "../helpers/logHelper";
import { findVaaInMongo, VAAStorage } from "../helpers/mongoHelper";
import { leftPaddingAddress } from "../helpers/serdeHelper";
import { emitChainIdToAddress } from "../backends/default/listener";

const logger = getLogger();

export async function getUnProcessSwap(): Promise<VAAStorage[]> {
  const result = await axios.get("https://crossswap-pre.coming.chat/v1/getUnSendTransferFromWormhole");
  let output: VAAStorage[] = [];
  try {
    for (let i = 0; i < result.data.record.length; i++) {
      try {
        const srcWormholeChainId = result.data.record[i].srcWormholeChainId;
        const sequence = result.data.record[i].dstWormholeChainId;
        let emitterAddress = emitChainIdToAddress[srcWormholeChainId];
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

