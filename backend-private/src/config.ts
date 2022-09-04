import { AccountsApi, BlocksApi, Configuration, InfoApi, NamesApi, SmartContractsApi, TransactionsApi } from "@stacks/blockchain-api-client";
import { StacksMainnet } from "micro-stacks/network";
const fetch = require("node-fetch");
import dotenv from "dotenv";
dotenv.config();

const STACKS_CORE_API_URL = "https://stacks-node-api.mainnet.stacks.co"

export const network =
    new StacksMainnet({ url: STACKS_CORE_API_URL })


const config = new Configuration({
    basePath: STACKS_CORE_API_URL,
    fetchApi: fetch,
});
export const infoApi = new InfoApi(config);
export const contractsApi = new SmartContractsApi(config);
export const transcationsApi = new TransactionsApi(config);
export const accountsApi = new AccountsApi(config);
export const bnsApi = new NamesApi(config);
export const blocksApi = new BlocksApi(config);

export const keys = {
    sponsor: {
        stacks: "SPACK6AQW3874T8Q4C9YKWB7613KHSVW7QN9VQXG",
        private: process.env.SPONSOR_SENDER_KEY!
    },
    advox: {
        stacks: "SPSTX06BNGJ2CP1F6WA8V49B6MYD784N6YZMK95G",
        private: process.env.ADVOX_SENDER_KEY!
    }
}