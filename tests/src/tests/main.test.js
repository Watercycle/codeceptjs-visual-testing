Feature('Visual Testing');

Scenario('loads', ({ I }) => {
  I.amOnPage('/');
  I.see('Hello World!');
});

Scenario('works with the default options', ({ I }) => {
  I.amOnPage('/');
  I.dontSeeVisualChanges("default-options");
});