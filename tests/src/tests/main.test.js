const assert = require("assert")

Feature('Visual Testing');

Scenario('loads (the tests are working as intended)', ({ I }) => {
  I.amOnPage('/');

  I.see('Hello World!');
});

Scenario('using the default options', ({ I }) => {
  I.amOnPage('/');

  I.dontSeeVisualChanges("default-options");
});

Scenario('using an `allowedMismatchedPixelsPercent` of 0%', async ({ I }) => {
  I.amOnPage('/');

  // This should always fail since the index page shows some unique time text.
  const passed = await tryTo(() => I.dontSeeVisualChanges("0-mismatch", {
    allowedMismatchedPixelsPercent: 0
  }));

  assert(!passed, "Expected a mismatch, but the there was none.");
});

Scenario('using `preserveTexts` on the page body', async ({ I }) => {
  I.amOnPage('/');

  I.dontSeeVisualChanges("preserve-body", {
    allowedMismatchedPixelsPercent: 0,
    preserveTexts: ['body']
  });
});