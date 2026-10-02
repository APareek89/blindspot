import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGoldenUpload } from "../packages/core/src/golden/upload";
import { GoldenExamplePatchSchema, GeneratedGoldenSchema, GoldenGenerateInputSchema, EvalPlanRunInputSchema, EvalPlanCreateInputSchema, ChatCompletionRequestSchema, WorkflowSpanBatchSchema, WorkflowContextShareInputSchema, MAX_UPLOAD_BYTES, MAX_UPLOAD_EXAMPLES } from "@blindspot/shared";

for (const [name, format, input] of [
  ["empty JSON array", "json", "[]"], ["empty JSONL", "jsonl", " \n"],
  ["header-only CSV", "csv", "input,rubric\n"], ["JSON object without examples", "json", "{}"],
  ["null JSON", "json", "null"], ["non-array examples", "json", '{"examples":{}}'],
  ["bad JSON syntax", "json", "["], ["bad JSONL line", "jsonl", '{}\n{'],
  ["blank input", "json", '[{"input":"   "}]'], ["missing input", "json", '[{"rubric":"accuracy"}]'],
  ["numeric input", "json", '[{"input":12}]'], ["array input", "json", '[{"input":["hello"]}]'],
  ["invalid label", "json", '[{"input":"hi","label":"accepted"}]'],
  ["duplicate CSV headings", "csv", "input,input\nfirst,second"],
  ["CSV field-count mismatch", "csv", "input,rubric\nhi,accuracy,extra"],
] as const) test(`upload rejects ${name}`, () => assert.throws(() => parseGoldenUpload(format, input)));

test("upload rejects non-text payload without TypeError leakage", () => assert.throws(() => parseGoldenUpload("json", {} as string), /must be text/));
test("upload rejects unknown format", () => assert.throws(() => parseGoldenUpload("yaml" as "json", "[]"), /Choose CSV/));
test("UTF-8 bytes enforce upload limit", () => assert.throws(() => parseGoldenUpload("json", "₹".repeat(Math.ceil(MAX_UPLOAD_BYTES / 3) + 1)), /max/));
test("row count enforces upload limit", () => assert.throws(() => parseGoldenUpload("json", JSON.stringify(Array.from({length: MAX_UPLOAD_EXAMPLES+1}, () => ({input:"x"})))), /max/));
for (const format of ["csv", "json", "jsonl"] as const) test(`${format} accepts BOM and preserves Unicode`, () => {
  const input = format === "csv" ? 'input,reference_output\n"₹1,000 invoice",Valid' : format === "json" ? '[{"input":"₹1,000 invoice","reference_output":"Valid"}]' : '{"input":"₹1,000 invoice","reference_output":"Valid"}';
  const rows = parseGoldenUpload(format, "\uFEFF"+input);assert.equal(rows[0]!.input,"₹1,000 invoice");assert.equal(rows[0]!.referenceOutput,"Valid");
});
test("input indentation retained for code evaluations", () => assert.equal(parseGoldenUpload("json", '[{"input":"  print(1)\\n"}]')[0]!.input,"  print(1)\n"));
test("patch cannot erase input with whitespace", () => assert.equal(GoldenExamplePatchSchema.safeParse({input:"\t \n"}).success,false));
test("generated example rejects whitespace-only rubric", () => assert.equal(GeneratedGoldenSchema.safeParse({input:"x",referenceOutput:"y",rubric:"  "}).success,false));
for (const count of [0,21,1.5,"2",null]) test(`generation count rejects ${JSON.stringify(count)}`, () => assert.equal(GoldenGenerateInputSchema.safeParse({count}).success,false));
test("live trace consent rejects truthy strings", () => assert.equal(GoldenGenerateInputSchema.safeParse({useLiveTraces:"false"}).success,false));
test("eval confirmation requires literal true", () => assert.equal(EvalPlanRunInputSchema.safeParse({planId:"11111111-1111-4111-8111-111111111111",confirm:"true"}).success,false));
for (const budgetUsd of [0,-1,101,Infinity,NaN,"1"]) test(`eval budget rejects ${String(budgetUsd)}`, () => assert.equal(EvalPlanCreateInputSchema.safeParse({modelRefs:["openai:gpt-4o-mini"],budgetUsd}).success,false));
test("chat refuses empty message list", () => assert.equal(ChatCompletionRequestSchema.safeParse({model:"openai:gpt-4o-mini",messages:[]}).success,false));
test("chat refuses streaming rather than misreporting it", () => assert.equal(ChatCompletionRequestSchema.safeParse({model:"openai:gpt-4o-mini",messages:[{role:"user",content:"hi"}],stream:true}).success,false));
test("chat bounds output tokens", () => assert.equal(ChatCompletionRequestSchema.safeParse({model:"openai:gpt-4o-mini",messages:[{role:"user",content:"hi"}],max_tokens:2049}).success,false));
test("telemetry cannot ingest an empty batch", () => assert.equal(WorkflowSpanBatchSchema.safeParse({spans:[]}).success,false));
test("context sharing requires explicit consent", () => assert.equal(WorkflowContextShareInputSchema.safeParse({workflow:{name:"test"},manifest:{version:"1"},consent:"yes"}).success,false));

for (const format of ["csv", "json", "jsonl"] as const) test(`${format} preserves expected reference alias`, () => {
  const row = { input: "What is the price?", expected: "$20 per month.", rubric: "Correct price", label: "pass" };
  const data = format === "csv" ? 'input,expected,rubric,label\nWhat is the price?,$20 per month.,Correct price,pass' : format === "json" ? JSON.stringify([row]) : JSON.stringify(row);
  assert.equal(parseGoldenUpload(format, data)[0]!.referenceOutput, row.expected);
});
test("upload rejects unknown output spelling rather than discarding it", () => assert.throws(() => parseGoldenUpload("jsonl", '{"input":"x","expected_output":"y"}'), /row 1: unknown field/));
test("upload rejects conflicting reference aliases", () => assert.throws(() => parseGoldenUpload("jsonl", '{"input":"x","expected":"y","reference_output":"z"}'), /conflicting reference/));
test("upload accepts identical reference aliases", () => assert.equal(parseGoldenUpload("jsonl", '{"input":"x","expected":"y","referenceOutput":"y"}')[0]!.referenceOutput,"y"));
test("upload rejects primitive row before projection", () => assert.throws(() => parseGoldenUpload("json", '["input"]'), /row 1: each example/));
