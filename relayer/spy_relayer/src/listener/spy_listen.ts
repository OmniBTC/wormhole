import {
  createSpyRPCServiceClient,
  subscribeSignedVAA,
} from "@certusone/wormhole-spydk";
import { getBackend } from "../backends";
import { getListenerEnvironment, ListenerEnvironment } from "../configureEnv";
import { getLogger } from "../helpers/logHelper";
import { PromHelper } from "../helpers/promHelpers";
import { sleep } from "../helpers/utils";
import { hexToUint8Array } from "@certusone/wormhole-sdk";

let metrics: PromHelper;
let env: ListenerEnvironment;
let logger = getLogger();
let vaaUriPrelude: string;

export function init(): boolean {
  try {
    env = getListenerEnvironment();
    vaaUriPrelude =
      "http://localhost:" +
      (process.env.REST_PORT ? process.env.REST_PORT : "4201") +
      "/relayvaa/";
  } catch (e) {
    logger.error("Error initializing listener environment: " + e);
    return false;
  }

  return true;
}

export async function run(ph: PromHelper) {
  const logger = getLogger();
  metrics = ph;
  logger.info("Attempting to run Listener...");
  logger.info(
    "spy_relay starting up, will listen for signed VAAs from [" +
      env.spyServiceHost +
      "]"
  );

  let typedFilters = await getBackend().listener.getEmitterFilters();
  const wrappedFilters = { filters: typedFilters };

  await getBackend().listener.process(hexToUint8Array("01000000000100696d2300a3798196634db775dca14d6e861997f077b0bbb950e01107d8b940264d6812a66cf1cca41657c7cba1d83b4c1485776cde0d9e9be24d3a69ab96fcdb00634a3d54849200000002000000000000000000000000f890982f9310df57d00f659cf4fd87e65aded8d70000000000000921010100000000000000000000000000000000000000000000000000005af3107a40000000000000000000000000003b10cb8830a10e41a00d41c34bed8c58d5a1de780002000000000000000000000000b6b12ada59a8ac44ded72e03693dd1461422434900060000000000000000000000000000000000000000000000000000000000000000"));

  while (true) {
    let stream: any;
    try {
      const client = createSpyRPCServiceClient(env.spyServiceHost || "");
      stream = await subscribeSignedVAA(client, wrappedFilters);

      //TODO validate that this is the correct type of the vaaBytes
      stream.on("data", ({ vaaBytes }: { vaaBytes: Buffer }) => {
        metrics.incIncoming();
        const asUint8 = new Uint8Array(vaaBytes);
        getBackend().listener.process(asUint8);
      });

      let connected = true;
      stream.on("error", (err: any) => {
        logger.error("spy service returned an error: %o", err);
        connected = false;
      });

      stream.on("close", () => {
        logger.error("spy service closed the connection!");
        connected = false;
      });

      logger.info(
        "connected to spy service, listening for transfer signed VAAs"
      );

      while (connected) {
        await sleep(1000);
      }
    } catch (e) {
      logger.error("spy service threw an exception: %o", e);
    }

    stream.destroy()
    await sleep(5 * 1000);
    logger.info("attempting to reconnect to the spy service");
  }
}
