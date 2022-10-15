import { MongoClient } from "mongodb";
import { getListenerEnvironment } from "../configureEnv";
import { getLogger } from "./logHelper";
import { parseVAA, VAA } from "./serdeHelper";
import { ChainId, uint8ArrayToHex } from "@certusone/wormhole-sdk";

const logger = getLogger();

const mongoUrl = getListenerEnvironment().mongoUrl;

export const mongoClient = new MongoClient(mongoUrl);

export const wormholeDB = mongoClient.db("Wormhole");


export interface VAAStorage extends VAA {
  hexString: string;
}

export const vaaCol = wormholeDB.collection<VAAStorage>("VAAStorage");


export async function addVaaInMongo(rawVaa: Uint8Array): Promise<VAA | null> {
  try {
    logger.info("addVaaInMongo");
    const vaa = await parseVAA(rawVaa);
    await vaaCol.updateOne(
      {
        sequence: vaa.sequence,
        emitterChainId: vaa.emitterChainId,
        emitterAddress: vaa.emitterAddress
      }
      ,
      {
        $set: {
          version: vaa.version,
          consistencyLevel: vaa.consistencyLevel,
          emitterAddress: vaa.emitterAddress,
          emitterChainId: vaa.emitterChainId,
          guardianSetIndex: vaa.guardianSetIndex,
          hash: vaa.hash,
          nonce: vaa.nonce,
          payload: vaa.payload,
          sequence: vaa.sequence,
          signatures: vaa.signatures,
          timestamp: vaa.timestamp,
          hexString: uint8ArrayToHex(rawVaa)
        }
      },
      { upsert: true }
    );
    logger.info("Add vaa to mongo, sequence: " + vaa.sequence +
      " emitterAddress: " + vaa.emitterAddress +
      " emitterChainId: " + vaa.emitterChainId +
      " hash: " + vaa.hash
    );
    return vaa;
  } catch (e) {
    logger.error("Add vaa to mongo fail: ", e);
  }
  return null;
}

export async function findVaaInMongo(
  emitterChainId: ChainId,
  emitterAddress: string,
  sequence: string
): Promise<VAAStorage | null> {
  try {
    return await vaaCol.findOne<VAAStorage>(
      {
        sequence: sequence,
        emitterChainId: emitterChainId,
        emitterAddress: emitterAddress
      }
    );
  } catch (e) {
    logger.error("Find " +
      emitterChainId + ", " +
      emitterAddress + ", " +
      sequence + " fail: ", e
    );
  }
  return null;
}

