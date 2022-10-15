import axios from "axios";
import { getLogger } from "../helpers/logHelper";
import { findVaaInMongo } from "../helpers/mongoHelper";
import { leftPaddingAddress } from "../helpers/serdeHelper";
import { emitChainIdToAddress } from "../backends/default/listener";

const logger = getLogger();

export async function getUnProcessSwap() {
  const result = await axios.get("https://crossswap-pre.coming.chat/v1/getUnSendTransferFromWormhole");
  try {
    console.log(result.data, result.data.record.length);
    for (let i = 0; i < result.data.record.length; i++) {
      // const srcWormholeChainId = result.data.record[i].srcWormholeChainId;
      const srcWormholeChainId = 4;
      const sequence = result.data.record[i].dstWormholeChainId;
      let emitterAddress;
      try {
        emitterAddress = emitChainIdToAddress[srcWormholeChainId];
      } catch (e) {
        logger.error("getUnProcessSwap fail for emitterAddress: ", e);
        return
      }
      console.log(srcWormholeChainId, sequence, emitterAddress);
      const item = await findVaaInMongo(srcWormholeChainId, leftPaddingAddress(emitterAddress), sequence.toString());
      if (item != null) {
        const now = new Date().getTime();
        if (now - item.timestamp >= 10 * 60) {
          // todo compensate req
        }
      }
    }
  } catch (e) {
    logger.error("getUnProcessSwap fail: ", e);
  }
}

