const assert = require('assert');
const { loadScript } = require('./harness.cjs');
const { exports: h } = loadScript('scripts/help.js', ['fawHelpTopic']);
for (const topic of ['overview','actions','aspects','combat','workflow','milestones','history']) {
  const row = h.fawHelpTopic(topic);
  assert.equal(row.key, topic);
  assert.ok(row.title);
  assert.ok(Array.isArray(row.bullets) && row.bullets.length >= 3);
}
assert.equal(h.fawHelpTopic('not-a-topic').key, 'overview');
console.log('help.test.cjs OK');
