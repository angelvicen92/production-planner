import test from "node:test";
import { runA2P15P14WitnessProbe } from "./runA2P15P14WitnessProbe";

test("P15 to P14 cross-Stage witness transition reports causal Evidence",async()=>{
  await runA2P15P14WitnessProbe();
});
