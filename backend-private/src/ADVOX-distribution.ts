import { ReadOnlyFunctionArgsFromJSON } from "@stacks/blockchain-api-client";
import {
  AnchorMode,
  createAssetInfo,
  FungibleConditionCode,
  makeContractCall,
  makeStandardFungiblePostCondition,
  sponsorTransaction,
} from "micro-stacks/transactions";
import {
  bufferCVFromString,
  cvToHex,
  cvToString,
  falseCV,
  listCV,
  noneCV,
  someCV,
  standardPrincipalCV,
  tupleCV,
  uintCV,
} from "micro-stacks/clarity"
import { network, accountsApi, bnsApi, contractsApi } from "./config";
import { keys } from "./config";
import { SEND_XBTC_MANY_CONTRACT, XBTC_CONTRACT } from "./constants";
import { readFileSync } from "fs";
import { handleTransaction } from "./utils";

const { sponsor, advox } = keys;

const dryrun = true;
const sponsored = true;
const payoutFee = 7_000;
const filename = "distribution-2022-08-28T052936.607Z" + ".csv";
const memo = filename.substring(13, 23) + " " + "k5AGVsG4fKKfyhq2vOypig";
console.log({ memo, filename });
const grouped = true;
const firstChaining = true; // <---- edit here, set to false to use nonces below
const noncesForRepeatedChaining =
  // nonces
  { nonce: 0, sponsorNonce: 0 }; // <---- edit here

async function payoutAdvocat(
  details: { amountXBTC: number; recipient: string }[],
  nonce: number,
  sponsorNonce: number
) {
  let total = details.reduce((sum, d) => sum + d.amountXBTC, 0);
  let options;
  if (details.length === 1) {
    const { amountXBTC, recipient } = details[0];
    options = {
      contractAddress: XBTC_CONTRACT.address,
      contractName: XBTC_CONTRACT.name,
      functionName: "transfer",
      functionArgs: [
        uintCV(amountXBTC),
        standardPrincipalCV(advox.stacks),
        standardPrincipalCV(recipient),
        someCV(bufferCVFromString(memo)),
      ],
      postConditions: [
        makeStandardFungiblePostCondition(
          advox.stacks,
          FungibleConditionCode.Equal,
          amountXBTC,
          createAssetInfo(
            XBTC_CONTRACT.address,
            XBTC_CONTRACT.name,
            "wrapped-bitcoin"
          )
        ),
      ],
    };
  } else {
    options = {
      contractAddress: SEND_XBTC_MANY_CONTRACT.address,
      contractName: SEND_XBTC_MANY_CONTRACT.name,
      functionName: "send-xbtc-many",
      functionArgs: [
        listCV(
          details.map((d) => {
            return tupleCV({
              to: standardPrincipalCV(d.recipient),
              "xbtc-in-sats": uintCV(d.amountXBTC),
              memo: bufferCVFromString(memo),
              "swap-to-ustx": falseCV(),
              "min-dy": noneCV(),
            });
          })
        ),
      ],
      postConditions: [
        makeStandardFungiblePostCondition(
          advox.stacks,
          FungibleConditionCode.Equal,
          total,
          createAssetInfo(
            XBTC_CONTRACT.address,
            XBTC_CONTRACT.name,
            "wrapped-bitcoin"
          )
        ),
      ],
    };
  }
  const tx = await makeContractCall({
    ...options,
    senderKey: advox.private,
    sponsored: sponsored,
    fee: 0,
    nonce: sponsored
      ? nonce
        ? nonce
        : undefined
      : sponsorNonce,
    network,
    anchorMode: AnchorMode.Any,
  });

  if (!dryrun) {
    if (sponsored) {
      const sponsoredTx = await sponsorTransaction({
        transaction: tx,
        fee: payoutFee,
        sponsorPrivateKey: sponsor.private,
        sponsorNonce: sponsorNonce ? sponsorNonce : undefined,
      });
      try {
        const result = await handleTransaction(sponsoredTx);
        console.log({ result, sponsorNonce, nonce });
      } catch (e: any) {
        console.log("err", e.toString(), e.toString().includes("BadNonce"));
        if (e.toString().includes("BadNonce")) {
          return;
        } else {
          throw e;
        }
      }
    } else {
      const result = await handleTransaction(tx);
      console.log({ result, nonce: sponsorNonce }); // paid by pool admin
    }
  } else {
    const result = await contractsApi.callReadOnlyFunction({
      contractAddress: options.contractAddress,
      contractName: options.contractName,
      functionName: options.functionName,
      readOnlyFunctionArgs: ReadOnlyFunctionArgsFromJSON({
        sender: advox.stacks,
        arguments: options.functionArgs.map((a) => cvToHex(a)),
      }),
    });
    console.log(
      { result },
      (tx.payload as any).functionArgs.map((a: any) => cvToString(a))
    );
  }
}

(async () => {
  const distributions = readFileSync(`./tool-scripts/${filename}`).toString();
  const lines = distributions.split("\n");
  console.log(lines);

  let accountInfo = await accountsApi.getAccountInfo({
    principal: advox.stacks,
    proof: 0,
  });
  let sponsorAccountInfo = await accountsApi.getAccountInfo({
    principal: sponsor.stacks,
    proof: 0,
  });

  const { nonce, sponsorNonce } = firstChaining
    ? { nonce: accountInfo.nonce, sponsorNonce: sponsorAccountInfo.nonce }
    : noncesForRepeatedChaining;
  console.log({ nonce, sponsorNonce });

  let i = 0;
  let total = 0;
  let batch: {
    amountXBTC: number,
    recipient: string,
  }[] = [];

  for (let line of lines) {
    let [name, amountString] = line.split(",");
    name = name.replace("-btc", ".btc");
    name = name.replace("-stx", ".stx");
    const amount = parseInt(amountString);

    if (amount <= 0) {
      continue;
    }
    try {
      const recipient = await bnsApi.getNameInfo({ name });
      const details = {
        amountXBTC: amount,
        recipient: recipient.address,
      };
      if (grouped) {
        batch.push(details);
        if (batch.length > 20) {
          await payoutAdvocat(batch, nonce + i, sponsorNonce + i);
          i += 1;
          batch = [];
        }
      } else {
        await payoutAdvocat([details], nonce + i, sponsorNonce + i);
        i += 1;
      }
      total += amount;
    } catch (e) {
      console.log(JSON.stringify(e));
      console.log({ i, nonce, sponsorNonce });
      break;
    }
  }

  if (batch.length > 0) {
    await payoutAdvocat(batch, nonce + i, sponsorNonce + i);
    i += 1;
    batch = [];
  }

  const balances = await accountsApi.getAccountBalance({
    principal: advox.stacks,
  });
  console.log({
    total,
    count: i,
    xBTC: parseInt(
      (balances.fungible_tokens as any)[
        "SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.Wrapped-Bitcoin::wrapped-bitcoin"
      ].balance
    ),
  });
})();
