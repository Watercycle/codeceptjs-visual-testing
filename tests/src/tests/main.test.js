Feature('Visual Testing');

Scenario('Can access the home page', ({ I }) => {
  I.amOnPage('/');
  // I.amOnPage('http://www.google.com');
  I.see('Hello World!');
});