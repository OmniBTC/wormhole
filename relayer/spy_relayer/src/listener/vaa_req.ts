import * as express from "express";
import { findDstGasInMongo, findVaaByToInMongo, findVaaInMongo } from "../helpers/mongoHelper";
import { getScopedLogger } from "../helpers/logHelper";
import { BigNumber } from "ethers";

const wormholeApp = express();

export async function wormholeAppInit() {
  const logger = getScopedLogger(["wormholeAppInit"]);
  wormholeApp.use(express.json());

  let rpc_port = process.env.RPC_PORT ? parseInt(process.env.RPC_PORT) : 5066;
  wormholeApp.listen(rpc_port, "localhost", () => {
    logger.info(`Wormhole Rpc Service start up: localhost:${rpc_port}`);
  });

  wormholeApp.post("*", async function(req, res) {
    try {
      if (req.body.method == "GetSignedVAA") {
        logger.info(
          `WormholeApp process request: method: ${req.body.method}, params: ${req.body.params}`
        );

        let response;
        if (req.body.params.length === 0) {
          response = "Required params: sequence [str], Optional params: chainid [number]";
        } else if (req.body.params.length === 1) {
          let result = await findVaaInMongo(
            req.body.params[0].toString()
          );
          response = JSON.stringify(result);
        } else if (req.body.params.length === 2) {
          let result = await findVaaInMongo(
            req.body.params[0].toString(),
            req.body.params[1]
          );
          response = JSON.stringify(result);
        } else {
          let result = await findVaaInMongo(
            req.body.params[0].toString(),
            req.body.params[1],
            req.body.params[2].toString()
          );
          response = JSON.stringify(result);
        }
        res.send(response);
      }else if (req.body.method == "GetSignedVAAByTo") {
        logger.info(
          `WormholeApp process request: method: ${req.body.method}, params: ${req.body.params}`
        );

        let response;
        if (req.body.params.length === 0) {
          response = "Required params: toCHain [number], Optional params: to [string]";
        } else if (req.body.params.length === 1) {
          let result = await findVaaByToInMongo(
            req.body.params[0]
          );
          response = JSON.stringify(result);
        } else {
          let result = await findVaaInMongo(
            req.body.params[0],
            req.body.params[1].toString()
          );
          response = JSON.stringify(result);
        }
        res.send(response);
      }


      else if (req.body.method == "GetDstGas") {
        logger.info(
          `WormholeApp process request: method: ${req.body.method}, params: ${req.body.params}`
        );
        let response;
        if (req.body.params.length === 2) {
          let result = await findDstGasInMongo(req.body.params[0], req.body.params[1]);
          if (result && result[0]) {
            if (result[1]) {
              for (let i = 1; i < result.length; i++) {
                result[0].vaaLength += result[i].vaaLength;
                result[0].estimateGas = BigNumber.from(result[0].estimateGas).add(BigNumber.from(result[i].estimateGas)).toBigInt();
                result[0].estimateGasPrice = BigNumber.from(result[0].estimateGasPrice).add(BigNumber.from(result[i].estimateGasPrice)).toBigInt();
                result[0].actualGas = BigNumber.from(result[0].actualGas).add(result[i].actualGas);
                result[0].actualGasPrice = BigNumber.from(result[0].actualGasPrice).add(result[i].actualGasPrice);
              }
            }

            let avgVaaLength = Math.floor(result[0].vaaLength / result.length);
            let avgEstimateGas = BigNumber.from(result[0].estimateGas).div(result.length).toString();
            let avgEstimateGasPrice = BigNumber.from(result[0].estimateGasPrice).div(result.length).toString();
            let avgActualGas = result[0].actualGas.div(result.length).toString();
            let avgActualGasPrice = result[0].actualGasPrice.div(result.length).toString();
            response = JSON.stringify({
              "VaaLength": avgVaaLength,
              "EstimateGas": avgEstimateGas,
              "EstimateGasPrice": avgEstimateGasPrice,
              "ActualGas": avgActualGas,
              "ActualGasPrice": avgActualGasPrice
            });
          } else {
            response = `Not exist dst gas at chain ${req.body.params[0]} for swap length ${req.body.params[1]}`;
          }
        } else {
          response = "Required params: chainId [number], dstSwapLength [number]";
        }
        res.send(response);
      } else {
        res.send(`Not found method: ${req.body.method}`);
      }
    } catch (e) {
      logger.info(`WormholeApp process request fail: ${e}`);
    }
  });
}
