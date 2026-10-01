import assert from "node:assert/strict";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { withExecution } from "@blindspot/db";
import { runChat, runStructured, listProviderModels } from "@blindspot/providers";
import { z } from "zod";
import { boundedProviderFetch, MAX_PROVIDER_RESPONSE_BYTES } from "../packages/providers/src/transport";
import { responseUsage } from "../packages/providers/src/metering";
import { parseGoldenUpload } from "../packages/core/src/golden/upload";

async function main() {
process.env.BLINDSPOT_AUTH_ENABLED = "0";
process.env.NODE_ENV = "test";
const nativeFetch = globalThis.fetch;
let calls: Request[] = []; let mode = "chat"; let body: any;
const answer = (content: string) => ({ id: "chatcmpl-fixture", object: "chat.completion", created: 1, model: "gpt-4o-mini",
  choices: [{ index:0,message:{role:"assistant",content},finish_reason:"stop" }],
  usage:{prompt_tokens:20,completion_tokens:4,prompt_tokens_details:{cached_tokens:5}} });
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init); calls.push(request); body = request.method === "POST" ? await request.clone().json() : undefined;
  assert.equal(new URL(request.url).hostname,"api.openai.com"); assert.equal(init?.redirect,"error");
  if (mode === "catalog") return Response.json({data:[{id:"gpt-4o-mini"},{id:"gpt-4o"},{id:"unpriced"}]});
  if (mode === "failure") return Response.json({error:{message:"private error must not escape"}},{status:429});
  return Response.json(answer(mode === "object" ? '{"score":0.9}' : mode === "invalid" ? 'not JSON' : 'fixture answer'));
};
let checks = 0;
try {
  const result = await runChat({modelRef:"openai:gpt-4o-mini",apiKey:"fixture",messages:[{role:"user",content:"fixture prompt"}],maxTokens:64,temperature:0});
  assert.equal(calls.length,1);assert.equal(result.promptTokens,20);assert.equal(result.completionTokens,4);
  assert.equal(body.max_tokens,64);assert.equal(body.temperature,0);assert.equal(body.stream,undefined);
  assert.ok(Math.abs(result.costCents! - 0.0005025)<1e-10);checks++;
  calls=[];mode="object";
  const structured=await runStructured({kind:"judge",modelRef:"openai:gpt-4o-mini",apiKey:"fixture",prompt:"grade synthetic",schema:z.object({score:z.number()}),maxTokens:128,mockValue:()=>({score:0.9})});
  assert.equal(structured.object.score,0.9);assert.equal(calls.length,1);assert.equal(body.response_format.type,"json_schema");checks++;
  calls=[];mode="invalid";
  await assert.rejects(runStructured({kind:"judge",modelRef:"openai:gpt-4o-mini",apiKey:"fixture",prompt:"grade",schema:z.object({score:z.number()}),maxTokens:128,mockValue:()=>({score:0.9})}),/no automatic retry/);assert.equal(calls.length,1);checks++;
  calls=[];mode="failure";
  await assert.rejects(runChat({modelRef:"openai:gpt-4o-mini",apiKey:"fixture",messages:[{role:"user",content:"fixture"}]}),/no automatic retry/);assert.equal(calls.length,1);checks++;
  calls=[];
  await assert.rejects(runChat({modelRef:"openai:gpt-4o-mini",apiKey:"fixture",messages:[{role:"user",content:[{type:"image",image:new URL("https://example.com/private")}]}] as any}),/text messages/);
  await assert.rejects(runChat({modelRef:"openai:gpt-4o-mini",apiKey:"fixture",messages:[{role:"user",content:"x".repeat(128001)}]}),/128KB/);assert.equal(calls.length,0);checks++;
  process.env.BLINDSPOT_AUTH_ENABLED="1";
  await assert.rejects(withExecution({ownerId:"11111111-1111-4111-8111-111111111111",projectId:"22222222-2222-4222-8222-222222222222",authId:"33333333-3333-4333-8333-333333333333",authKind:"session",mode:"prepared"},()=>runChat({modelRef:"openai:gpt-4o-mini",apiKey:"fixture",messages:[{role:"user",content:"fixture"}]})),/Prepared/);assert.equal(calls.length,0);checks++;
  process.env.BLINDSPOT_AUTH_ENABLED="0";mode="catalog";
  const catalog=await listProviderModels("openai","fixture");assert.equal(catalog.length,2);assert.equal(catalog[0]?.capabilities.structuredOutput,true);checks++;
  await assert.rejects(boundedProviderFetch("https://attacker.example/v1/models"),/origin/);checks++;
  assert.deepEqual(responseUsage({usage:{input_tokens:4,cache_read_input_tokens:2,output_tokens:3}}),{inputTokens:6,outputTokens:3,cachedInputTokens:2});checks++;
  // Actual Node fetch decompression, success/error and expanded-size limit: loopback only.
  const server=createServer((_request,response)=>{
    const oversized=mode==="gzip-large" || mode==="gzip-large-error";
    const payload=oversized?'x'.repeat(MAX_PROVIDER_RESPONSE_BYTES+1):JSON.stringify(answer('gzip fixture'));
    const compressed=gzipSync(payload);response.writeHead(["gzip-error","gzip-large-error"].includes(mode)?429:200,{"content-type":"application/json","content-encoding":"gzip","content-length":compressed.length});response.end(compressed);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address&&typeof address==="object");
  globalThis.fetch=async()=>nativeFetch(`http://127.0.0.1:${address.port}`);
  try {
    mode="gzip";const response=await boundedProviderFetch("https://api.openai.com/v1/chat/completions");assert.equal(response.headers.get("content-encoding"),null);assert.equal(responseUsage(await response.json())?.inputTokens,20);checks++;
    mode="gzip";const decoded=await runChat({modelRef:"openai:gpt-4o-mini",apiKey:"fixture",messages:[{role:"user",content:"gzip sdk fixture"}],maxTokens:64});assert.equal(decoded.text,"gzip fixture");assert.equal(decoded.promptTokens,20);checks++;
    mode="gzip-error";assert.equal((await boundedProviderFetch("https://api.openai.com/v1/chat/completions")).status,429);checks++;
    mode="gzip-large";await assert.rejects(boundedProviderFetch("https://api.openai.com/v1/chat/completions"),/exceeds limit/);checks++;
    mode="gzip-large-error";await assert.rejects(boundedProviderFetch("https://api.openai.com/v1/chat/completions"),/exceeds limit/);checks++;
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
  process.env.BLINDSPOT_MOCK_MODE="1";
  globalThis.fetch=async()=>{throw new Error("sample mode attempted network");};
  const sample=await runChat({modelRef:"openai:gpt-4o-mini",apiKey:"",messages:[{role:"user",content:"sample"}]});assert.equal(sample.fixture,true);assert.equal(sample.promptTokens,0);assert.match(sample.text,/no provider call/);checks++;
  const sampleObject=await runStructured({kind:"judge",modelRef:"openai:gpt-4o-mini",apiKey:"",prompt:"sample",schema:z.object({score:z.number()}),maxTokens:128,mockValue:()=>({score:0.9})});assert.equal(sampleObject.fixture,true);assert.equal(sampleObject.costCents,0);assert.equal((await listProviderModels("openai","")).every(m=>m.source==="curated"&&m.probeStatus==="unverified"),true);checks++;
  delete process.env.BLINDSPOT_MOCK_MODE;
  const csv=parseGoldenUpload("csv",'input,reference_output,rubric\n"Question, with comma",Answer,Correctness\n"multi\nline",Second,Clarity');assert.equal(csv.length,2);assert.equal(csv[0]?.input,"Question, with comma");checks++;
  const polluted=parseGoldenUpload("csv",'input,__proto__,constructor\nSafe,evil,bad');assert.equal(polluted[0]?.input,"Safe");assert.equal(({} as any).evil,undefined);assert.equal(Object.getPrototypeOf(polluted[0]),Object.prototype);checks++;
  console.log(JSON.stringify({status:"passed",checks,real_provider_calls:0,actual_sdk:"AI4 text+structured OpenAI",compression:"actual loopback gzip decoded/capped"}));
} finally { globalThis.fetch=nativeFetch; }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
