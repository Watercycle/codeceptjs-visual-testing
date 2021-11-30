Feature('Visual Testing');

Scenario('Can access the home page', ({ I }) => {
  I.amOnPage('/');
  I.see('Do you also fail?!');
});