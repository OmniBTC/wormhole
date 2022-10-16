import * as express from "express";
import { findVaaInMongo } from "../helpers/mongoHelper";
import { leftPaddingAddress } from "../helpers/serdeHelper";
import { getScopedLogger } from "../helpers/logHelper";

const wormholeApp = express();


export async function wormholeAppInit() {
  const logger = getScopedLogger(["wormholeAppInit"]);
  wormholeApp.use(express.json());

  wormholeApp.listen(5066, "localhost", () => {
    logger.info(`Wormhole Rpc Service start up: localhost:5066`);
  });

  wormholeApp.post("*", async function(req, res) {
    try {
      if (req.body.method == "GetSignedVAA") {
        logger.info("WormholeApp process request: method: " + req.body.method + ", params: " + req.body.params);
        let result = await findVaaInMongo(req.body.params[0], leftPaddingAddress(req.body.params[1]), req.body.params[2].toString());
        res.send(JSON.stringify(result));
      } else {
        res.send("Not found method: " + req.body.method);
      }
    } catch (e) {
      logger.info("WormholeApp process request fail: ", e);
    }
  });
}