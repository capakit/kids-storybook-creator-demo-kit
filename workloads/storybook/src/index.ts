import { createWorkloadSdk } from "@capakit/sdk";
import { registerHttp } from "./capakit_http.ts";
import { registerTestHttp } from "./capakit_test.ts";

const sdk = createWorkloadSdk();
sdk.hijackConsoleLogging();

registerHttp(sdk);
registerTestHttp(sdk);

await sdk.start();
