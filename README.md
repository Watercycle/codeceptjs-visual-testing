# Codeceptjs Visual Testing

[![npm version](https://badge.fury.io/js/codeceptjs-visual-testing.svg)](https://badge.fury.io/js/codeceptjs-visual-testing)

`codeceptjs-visual-testing` is a plugin _(helper)_ for [CodeceptJS](https://codecept.io/) E2E tests that helps verify that your UI doesn't unexpectedly change.

It makes use of [pixelmatch](https://github.com/mapbox/pixelmatch) and [pngjs](https://github.com/lukeapage/pngjs) in order to avoid the ridiculous dependencies for ImageMagick and applies some basic heuristics to help prevent false positives.

![0-mismatch](https://user-images.githubusercontent.com/5145006/144205486-ad83e74d-be67-40e8-a082-de6e0b706ac4.png)

# Installation

1. Run

```
npm install codeceptjs-visual-testing
```

2. Add the following to your `codeceptjs.conf.js` file.

```js
exports.config = {
  helpers: {
    VisualTesting: {
      require: 'codeceptjs-visual-testing',

      // This is where baseline screenshots will be stored alongside any
      // extra json data used by this helper.
      baseFolder: '../visual/',
      
      // If your test fails, an image will be generated in this directory
      // that highlights the differences between your app's current state
      // and the baseline image.
      diffFolder: '../output/visual/'
    }
  }
}
```

# Usage

### Example

```js
Scenario('the dashboard page looks the same', async () => {
   I..amOnPage('/');

   await I.dontSeeVisualChanges('dashboard_basic', {
     // Optionally, substitute matched text in new screenshots using text from the baseline image (Default: []).
     preserveTexts: ['.date:last-of-type', '#random-string'],
     // Optionally, hide elements that can't be consistently reproduced (Default: []).
     hideElements: ['.some-randmom-popup'],
     // Optionally, allow for more variation in the screenshot without failing the test (Default: 1).
     allowedMismatchedPixelsPercent: 3
   })
})
```

### Creating and Updating Baseline Images

1. Run `UPDATE_VISUALS=1 codeceptjs run`
2. Commit the files generated in your `baseFolder`

### Disclaimer

Visual tests should generally be used sparingly and on pages unlikely to change.
Altering the page style or layout will mean needing to update the corresponding visual tests.
Similarly, unless you're using [git lfs](https://git-lfs.github.com/), the binary image files
may eventually take up a lot of space in your Git repo history.

# Testing

Run `npm run test:docker` to run this project's tests.

This project comes with a simple test app and is containerized with [Docker](https://www.docker.com/) for easier cross-platform development and automated CI tests.
