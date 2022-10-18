import {MongoClient} from "mongodb";
import {getListenerEnvironment} from "../configureEnv";
import {getScopedLogger} from "./logHelper";
import {parseVAA, VAA} from "./serdeHelper";
import {ChainId, uint8ArrayToHex} from "@certusone/wormhole-sdk";
import {BigNumber} from "ethers";

const logger = getScopedLogger(["Mongo"]);

const mongoUrl = getListenerEnvironment().mongoUrl;

export const mongoClient = new MongoClient(mongoUrl);

export const wormholeDB = mongoClient.db("Wormhole");

export interface VAAStorage extends VAA {
    hexString: string;
}

export interface RelayerDstGas {
    chainId: ChainId;
    vaaLength: number;
    dstSwapLength: number;
    estimateGas: BigInt;
    estimateGasPrice: BigInt;
    actualGas: BigNumber;
    actualGasPrice: BigNumber;
}

export const vaaCol = wormholeDB.collection<VAAStorage>("VAAStorage");
export const dstGasCol = wormholeDB.collection<RelayerDstGas>("RelayerDstGas");

export async function addVaaInMongo(rawVaa: Uint8Array): Promise<VAA | null> {
    try {
        const vaa = await parseVAA(rawVaa);
        await vaaCol.updateOne(
            {
                sequence: vaa.sequence,
                emitterChainId: vaa.emitterChainId,
                emitterAddress: vaa.emitterAddress,
            },
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
                    hexString: uint8ArrayToHex(rawVaa),
                },
            },
            {upsert: true}
        );
        logger.info(
            "Add vaa to mongo, sequence: " +
            vaa.sequence +
            " emitterAddress: " +
            vaa.emitterAddress +
            " emitterChainId: " +
            vaa.emitterChainId +
            " hash: " +
            vaa.hash
        );
        return vaa;
    } catch (e) {
        logger.error("Add vaa to mongo fail: ", e);
    }
    return null;
}

export async function findVaaInMongo(
    sequence: string,
    emitterChainId?: ChainId,
    emitterAddress?: string
): Promise<VAAStorage | null> {
    try {
        // logger.debug(
        //   `Find vaa --> sequence:[${sequence}], emitterChainId:[${emitterChainId}] emitterAddress:[${emitterAddress}]`
        // );
        if (emitterChainId && emitterAddress) {
            return await vaaCol.findOne<VAAStorage>({
                sequence: sequence,
                emitterChainId: emitterChainId,
                emitterAddress: emitterAddress,
            });
        } else if (emitterChainId) {
            return await vaaCol.findOne<VAAStorage>({
                sequence: sequence,
                emitterChainId: emitterChainId
            });
        } else {
            return await vaaCol.findOne<VAAStorage>({
                sequence: sequence
            })
        }
    } catch (e) {
        logger.error(
            "Find " +
            emitterChainId +
            ", " +
            emitterAddress +
            ", " +
            sequence +
            " fail: ",
            e
        );
    }
    return null;
}

export async function addDstGasInMongo(
    relayerDstGas: RelayerDstGas
): Promise<RelayerDstGas | null> {
    if (
        relayerDstGas.estimateGas === BigInt(0) ||
        relayerDstGas.estimateGasPrice === BigInt(0)
    ) {
        logger.warn("Estimated relayer dst gas or gas price is 0.");
        return null;
    }
    try {
        await dstGasCol.insertOne({
            chainId: relayerDstGas.chainId,
            vaaLength: relayerDstGas.vaaLength,
            dstSwapLength: relayerDstGas.dstSwapLength,
            estimateGas: relayerDstGas.estimateGas,
            estimateGasPrice: relayerDstGas.estimateGasPrice,
            actualGas: relayerDstGas.actualGas,
            actualGasPrice: relayerDstGas.actualGasPrice,
        });
        logger.info(
            "Add dst gas to mongo, chainId: " +
            relayerDstGas.chainId +
            " vaaLength: " +
            relayerDstGas.vaaLength +
            " dstSwapLength: " +
            relayerDstGas.dstSwapLength +
            " estimateGas: " +
            relayerDstGas.estimateGas +
            " estimateGasPrice: " +
            relayerDstGas.estimateGasPrice +
            " actualGas: " +
            relayerDstGas.actualGas +
            " actualGasPrice: " +
            relayerDstGas.actualGasPrice
        );
    } catch (e) {
        logger.error("Add relayer dst gas to mongo fail: ", e);
    }
    return null;
}

export async function findDstGasInMongo(
    chainId: ChainId,
    dstSwapLength: number
): Promise<RelayerDstGas[] | null> {
    try {
        return await dstGasCol
            .find<RelayerDstGas>({
                chainId: chainId,
                dstSwapLength: dstSwapLength
            })
            .toArray();
    } catch (e) {
        logger.error("Find " + chainId + " dst gas fail: ", e);
    }
    return null;
}
