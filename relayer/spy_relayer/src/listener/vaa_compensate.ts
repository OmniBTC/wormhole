import axios from "axios";
import { findVaaInMongo, VAAStorage } from "../helpers/mongoHelper";
import { leftPaddingAddress } from "../helpers/serdeHelper";
import { emitChainIdToAddress } from "../backends/default/listener";
import { getScopedLogger } from "../helpers/logHelper";

export async function getUnProcessSwap(): Promise<VAAStorage[]> {
  const logger = getScopedLogger(["getUnProcessSwap"]);
  const result = await axios.get(
    "https://crossswap-pre.coming.chat/v1/getUnSendTransferFromWormhole"
  );

  let output: VAAStorage[] = [];
  try {
    for (let i = 0; i < result.data.record.length; i++) {
      try {
        const sequence = result.data.record[i].sequence;
        const srcWormholeChainId = result.data.record[i].srcWormholeChainId;
        const emitterAddress = emitChainIdToAddress[srcWormholeChainId];

        if (!emitterAddress) {
          continue;
        }
        const item = await findVaaInMongo(
          sequence.toString(),
          srcWormholeChainId,
          leftPaddingAddress(emitterAddress.toLowerCase())
        );

        if (item != null) {
          const now = Math.floor(new Date().getTime() / 1000);
          //   logger.debug(
          //     `now: ${now}, item timestamp: ${item.timestamp}, sequence: ${sequence}`
          //   );
          if (now - item.timestamp <= 60 * 60 * 24) {
            output.push(item);
          }
        }
      } catch (e) {
        logger.error(`getUnProcessSwap process fail: ${e}`);
      }
    }
  } catch (e) {
    logger.error(`getUnProcessSwap format error: ${e}`);
  }
  if (output.length > 0) {
    logger.info(`Start compensate item length: ${output.length}`);
  }
  return output;
}
