// Each line is the body of one {{ }} block. Hover a name for the return type.
// Red squiggles are the errors the service reports. Run `pnpm playground` after
// changing example-runtime.ts to regenerate globals.d.ts.

const r1 = $json.user.emails.first().isEmail();
const r2 = $('Webhook').item.json.body.orderId;
const r3 = $('Edit Fields').first().binary.invoice.fileName;
const r4 = $input.all().map((i) => i.json.n).sum();
const r5 = $now.plus({ days: 1 }).beginningOf('month').format('yyyy-MM');
const r6 = $if($json.n > 1, $json.test, $json.n);
const r7 = $ifEmpty($json.nothing, 'fallback');
const r8 = $json.test.toTitleCase().toSnakeCase();

// invalid
const e1 = $json.test.toUppercase();
const e2 = $json.nothing.x;
const e3 = $vars.nope;
const e4 = $execution.mode === 'prod';
const e5 = $('Webhook').item.json.body.orderId.toUpperCase();
