import * as express from "express";
import { findVaaInMongo } from "../helpers/mongoHelper";
import { leftPaddingAddress } from "../helpers/serdeHelper";

const wormholeApp = express();


export async function wormholeAppInit() {
  wormholeApp.use(express.json());

  wormholeApp.listen(5066, "localhost", () => {
    console.log(`Wormhole Rpc Service start up: localhost:5066`);
  });

  wormholeApp.post("*", async function(req, res) {
    console.log("WormholeApp process request: ", req.body)
    if (req.body.method == "GetSignedVAA") {
      let result = await findVaaInMongo(req.body.params[0], leftPaddingAddress(req.body.params[1]), req.body.params[2].toString());
      res.send(JSON.stringify(result));
    } else {
      res.send("Not found method: " + req.body.method);
    }
  });
}