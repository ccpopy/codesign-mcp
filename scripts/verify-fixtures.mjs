// 验证 fixture 顶层结构，列出关键字段
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function summarize(path, picker = (x) => x) {
  const obj = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const target = picker(obj);
  if (Array.isArray(target)) {
    return { __isArray: true, length: target.length, sampleKeys: target[0] ? Object.keys(target[0]) : [] };
  }
  if (target && typeof target === 'object') {
    return Object.keys(target);
  }
  return target;
}

console.log('--- sharing-detail.response.body top-level keys ---');
console.log(summarize('tests/fixtures/sharing-detail.json', (o) => o.sample?.response?.body));

console.log('\n--- sharing-detail.response.body.designs[0] keys ---');
const sd = JSON.parse(readFileSync(resolve('tests/fixtures/sharing-detail.json'), 'utf8'));
const designs = sd.sample?.response?.body?.designs;
console.log({ designsLength: designs?.length, sampleDesignKeys: designs?.[0] && Object.keys(designs[0]) });

console.log('\n--- sharing-detail.response.body.designs[0].screens[0] keys ---');
const screens = designs?.[0]?.screens;
console.log({ screensLength: screens?.length, sampleScreenKeys: screens?.[0] && Object.keys(screens[0]) });

console.log('\n--- sharing-detail.response.body.designs[0].screens[0].image keys ---');
console.log(screens?.[0]?.image && Object.keys(screens[0].image));

console.log('\n--- meta-spec-object.response.body top-level keys ---');
console.log(summarize('tests/fixtures/meta-spec-object.json', (o) => o.sample?.response?.body));

const spec = JSON.parse(readFileSync(resolve('tests/fixtures/meta-spec-object.json'), 'utf8'));
const specBody = spec.sample?.response?.body;
console.log('\n--- spec.layers[0] keys ---');
console.log(specBody?.layers?.[0] && Object.keys(specBody.layers[0]));

console.log('\n--- spec.groups (length) ---');
console.log({ length: specBody?.groups?.length, sampleKeys: specBody?.groups?.[0] && Object.keys(specBody.groups[0]) });

console.log('\n--- spec.css (sample) ---');
console.log({ length: Array.isArray(specBody?.css) ? specBody.css.length : 'not-array', sample: Array.isArray(specBody?.css) ? specBody.css.slice(0, 2) : specBody?.css });

console.log('\n--- meta-slice-manifest.response.body (array) ---');
const sl = JSON.parse(readFileSync(resolve('tests/fixtures/meta-slice-manifest.json'), 'utf8'));
const slBody = sl.sample?.response?.body;
console.log({
  __isArray: Array.isArray(slBody),
  length: Array.isArray(slBody) ? slBody.length : 0,
  sampleItemKeys: Array.isArray(slBody) && slBody[0] ? Object.keys(slBody[0]) : [],
  sampleExportableKeys: Array.isArray(slBody) && slBody[0]?.exportables?.[0] ? Object.keys(slBody[0].exportables[0]) : [],
  sampleScreenshotKeys: Array.isArray(slBody) && slBody[0]?.exportables?.[0]?.screenshot ? Object.keys(slBody[0].exportables[0].screenshot) : [],
});

console.log('\n--- user.authorized.response.body keys ---');
console.log(summarize('tests/fixtures/user.json', (o) => o.samples?.authorized?.response?.body));
